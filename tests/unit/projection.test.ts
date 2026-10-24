/**
 * Projection engine tests. Expected values are hand-computed from CONVENTIONS
 * (sections 3-7); see the comments. Default fixture: start 2025-01-01 (Wed),
 * $1,000.00 opening, 90 days (window 2025-01-01..2025-03-31), weeks start Sunday.
 */
import { describe, expect, it } from "vitest";
import { computeProjection } from "@/domain/projection";
import type { ProjectionResponse } from "@/contracts/api";
import { bill, income, input, occ, rng, settings } from "../helpers/fixtures";
import { assertReconciled, oracleAddDays, oracleClosings } from "../helpers/invariants";

const run = (...args: Parameters<typeof input>) => {
  const p = computeProjection(input(...args));
  assertReconciled(p);
  return p;
};
const closingOn = (p: ProjectionResponse, date: string) => p.days.find((d) => d.date === date)!.closingBalanceCents;

describe("basic balances", () => {
  it("1. $1,000 start, $200 bill, no income -> $800", () => {
    const p = run({ bills: [bill("rent", 20000, "ONE_TIME", "2025-01-10")] });
    expect(closingOn(p, "2025-01-09")).toBe(100000);
    expect(closingOn(p, "2025-01-10")).toBe(80000);
    expect(p.totals.endingBalanceCents).toBe(80000);
    expect(p.totals.billsCents).toBe(20000);
    expect(p.totals.incomeCents).toBe(0);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]).toMatchObject({ signedAmountCents: -20000, balanceAfterCents: 80000, status: "UPCOMING" });
  });

  it("2. $1,000 + $500 paycheck - $200 bill -> $1,300", () => {
    const p = run({
      incomes: [income("pay", 50000, "ONE_TIME", "2025-01-05")],
      bills: [bill("rent", 20000, "ONE_TIME", "2025-01-10")],
    });
    expect(closingOn(p, "2025-01-05")).toBe(150000);
    expect(p.totals.endingBalanceCents).toBe(130000);
    expect(p.totals.netCents).toBe(30000);
  });

  it("events on the start date are applied; the opening is before them", () => {
    const p = run({ bills: [bill("b", 2500, "ONE_TIME", "2025-01-01")] });
    expect(p.days[0]).toMatchObject({ openingBalanceCents: 100000, billsCents: 2500, closingBalanceCents: 97500 });
  });

  it("3. weekly income every 7 days (anchor Fri 01-03, 28 days: 03,10,17,24 -> 4 x $100)", () => {
    const p = run({
      settings: settings({ startingBalanceCents: 0, forecastDays: 28 }),
      incomes: [income("w", 10000, "WEEKLY", "2025-01-03")],
    });
    expect(p.events.map((e) => e.date)).toEqual(["2025-01-03", "2025-01-10", "2025-01-17", "2025-01-24"]);
    expect(p.totals.endingBalanceCents).toBe(40000);
  });

  it("4. biweekly every 14 days at the full amount, never split", () => {
    // anchor 01-03, 28 days -> 01-03, 01-17; $1,000 each = $2,000
    const p = run({
      settings: settings({ startingBalanceCents: 0, forecastDays: 28 }),
      incomes: [income("bw", 100000, "BIWEEKLY", "2025-01-03")],
    });
    expect(p.events.map((e) => [e.date, e.amountCents])).toEqual([
      ["2025-01-03", 100000],
      ["2025-01-17", 100000],
    ]);
    expect(p.days.find((d) => d.date === "2025-01-10")!.incomeCents).toBe(0);
    expect(p.totals.incomeCents).toBe(200000);
  });

  it("5. multiple income sources combine", () => {
    // weekly $100 (01-03,10,17,24) = $400; biweekly $1,000 (01-10, 01-24) = $2,000 -> $2,400
    const p = run({
      settings: settings({ startingBalanceCents: 0, forecastDays: 28 }),
      incomes: [income("w", 10000, "WEEKLY", "2025-01-03"), income("bw", 100000, "BIWEEKLY", "2025-01-10")],
    });
    expect(p.totals.incomeCents).toBe(240000);
    expect(p.totals.endingBalanceCents).toBe(240000);
    expect(p.days.find((d) => d.date === "2025-01-10")!.incomeCents).toBe(110000);
  });
});

describe("6. same-day events and ordering", () => {
  it("each bill counted once; income first, then name (case-insensitive)", () => {
    const p = run({
      incomes: [income("i1", 50000, "ONE_TIME", "2025-01-15", { name: "Zed pay" })],
      bills: [
        bill("b1", 100000, "ONE_TIME", "2025-01-15", { name: "rent" }),
        bill("b2", 6000, "ONE_TIME", "2025-01-15", { name: "Internet" }),
        bill("b3", 8000, "ONE_TIME", "2025-01-15", { name: "electric" }),
      ],
    });
    // 100000 +50000 = 150000; -8000 = 142000; -6000 = 136000; -100000 = 36000
    expect(p.events.map((e) => [e.name, e.balanceAfterCents])).toEqual([
      ["Zed pay", 150000],
      ["electric", 142000],
      ["Internet", 136000],
      ["rent", 36000],
    ]);
    expect(p.events.map((e) => e.sequence)).toEqual([0, 1, 2, 3]);
    const day = p.days.find((d) => d.date === "2025-01-15")!;
    expect(day).toMatchObject({ incomeCents: 50000, billsCents: 114000, netCents: -64000, closingBalanceCents: 36000 });
    expect(day.eventIds).toHaveLength(4);
  });

  it("ties: exact name after case-insensitive, then sourceId", () => {
    const p = run({
      bills: [
        bill("z", 100, "ONE_TIME", "2025-01-02", { name: "gym" }),
        bill("b", 100, "ONE_TIME", "2025-01-02", { name: "Gym" }),
        bill("a", 100, "ONE_TIME", "2025-01-02", { name: "Gym" }),
      ],
    });
    // "Gym" < "gym" in code units; equal names -> sourceId a before b
    expect(p.events.map((e) => e.sourceId)).toEqual(["a", "b", "z"]);
  });

  it("two bills with identical name/amount/date are both counted", () => {
    const p = run({
      bills: [bill("x1", 1000, "ONE_TIME", "2025-01-02", { name: "Dup" }), bill("x2", 1000, "ONE_TIME", "2025-01-02", { name: "Dup" })],
    });
    expect(p.events).toHaveLength(2);
    expect(p.totals.endingBalanceCents).toBe(98000);
  });
});

describe("7/16. month-end and leap years inside the projection", () => {
  it("monthly Jan 31 bill over the 90-day window: 01-31, 02-28, 03-31", () => {
    const p = run({ bills: [bill("m", 10000, "MONTHLY", "2025-01-31")] });
    expect(p.events.map((e) => e.date)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
    expect(p.totals.endingBalanceCents).toBe(70000);
  });

  it("monthly Jan 31 2028 -> Feb 29 2028; yearly Feb 29 -> Feb 28 2027", () => {
    const p = run({
      settings: settings({ projectionStartDate: "2027-01-01", forecastDays: 366 }), // 2027-01-01..2028-01-01
      bills: [bill("y", 5000, "YEARLY", "2024-02-29")],
    });
    expect(p.events.map((e) => e.date)).toEqual(["2027-02-28"]);
    const q = run({
      // 2028 is a leap year: 91 days = 2028-01-01..2028-03-31 (31 + 29 + 31)
      settings: settings({ projectionStartDate: "2028-01-01", forecastDays: 91 }),
      bills: [bill("m", 5000, "MONTHLY", "2028-01-31"), bill("y", 7000, "YEARLY", "2024-02-29")],
    });
    expect(q.events.map((e) => `${e.sourceId}:${e.date}`)).toEqual(["m:2028-01-31", "m:2028-02-29", "y:2028-02-29", "m:2028-03-31"]);
  });
});

describe("8/9/18. one-time, out-of-window events, inactive, endDate", () => {
  it("one-time never recurs even with an endDate", () => {
    const p = run({ bills: [bill("o", 1000, "ONE_TIME", "2025-01-05", { endDate: "2025-03-31" })] });
    expect(p.events).toHaveLength(1);
  });

  it("events before the start or after the window are ignored", () => {
    const p = run({
      settings: settings({ forecastDays: 30 }), // 2025-01-01..2025-01-30
      incomes: [income("before", 99999, "ONE_TIME", "2024-12-31"), income("after", 88888, "ONE_TIME", "2025-01-31")],
      bills: [bill("b-before", 7777, "ONE_TIME", "2024-12-15"), bill("w", 1000, "WEEKLY", "2024-12-25")],
    });
    // weekly from 12-25 in window: 01-01, 08, 15, 22, 29 -> 5 x $10
    expect(p.events.map((e) => e.id)).toEqual([
      "BILL:w:2025-01-01",
      "BILL:w:2025-01-08",
      "BILL:w:2025-01-15",
      "BILL:w:2025-01-22",
      "BILL:w:2025-01-29",
    ]);
    expect(p.totals.endingBalanceCents).toBe(95000);
    expect(p.days[0].openingBalanceCents).toBe(100000);
  });

  it("inactive items generate nothing; endDate is inclusive", () => {
    const p = run({
      settings: settings({ forecastDays: 31 }),
      incomes: [income("off", 50000, "WEEKLY", "2025-01-03", { active: false })],
      bills: [
        bill("offb", 50000, "WEEKLY", "2025-01-03", { active: false }),
        bill("ends", 1000, "WEEKLY", "2025-01-03", { endDate: "2025-01-17" }), // 03, 10, 17
      ],
      occurrences: [occ("offb", "2025-01-03", "PAID")],
    });
    expect(p.events.map((e) => e.date)).toEqual(["2025-01-03", "2025-01-10", "2025-01-17"]);
    expect(p.totals.endingBalanceCents).toBe(97000);
  });
});

describe("10. weeks", () => {
  const weekCase = (weekStartsOn: number) =>
    run({
      settings: settings({ forecastDays: 14, weekStartsOn }), // 2025-01-01 (Wed)..2025-01-14 (Tue)
      bills: [bill("sat", 10000, "ONE_TIME", "2025-01-04"), bill("sun", 5000, "ONE_TIME", "2025-01-05")],
      incomes: [income("pay", 30000, "ONE_TIME", "2025-01-12")],
    });

  it("weekStartsOn 0 (Sunday)", () => {
    const p = weekCase(0);
    expect(p.weeks.map((w) => [w.weekStart, w.rangeStart, w.rangeEnd, w.partial, w.openingBalanceCents, w.closingBalanceCents])).toEqual([
      ["2024-12-29", "2025-01-01", "2025-01-04", true, 100000, 90000], // -$100 on Sat 01-04
      ["2025-01-05", "2025-01-05", "2025-01-11", false, 90000, 85000], // -$50 on Sun 01-05
      ["2025-01-12", "2025-01-12", "2025-01-14", true, 85000, 115000], // +$300 on 01-12
    ]);
  });

  it("weekStartsOn 1 (Monday)", () => {
    const p = weekCase(1);
    expect(p.weeks.map((w) => [w.weekStart, w.rangeStart, w.rangeEnd, w.partial, w.openingBalanceCents, w.closingBalanceCents])).toEqual([
      ["2024-12-30", "2025-01-01", "2025-01-05", true, 100000, 85000], // both bills
      ["2025-01-06", "2025-01-06", "2025-01-12", false, 85000, 115000], // income on Sun 01-12
      ["2025-01-13", "2025-01-13", "2025-01-14", true, 115000, 115000],
    ]);
  });

  it("each week's closing equals the next week's opening across a long window", () => {
    const p = run({
      settings: settings({ forecastDays: 366 }),
      incomes: [income("bw", 123456, "BIWEEKLY", "2025-01-03")],
      bills: [bill("m", 99999, "MONTHLY", "2025-01-31"), bill("w", 1299, "WEEKLY", "2025-01-06")],
    });
    for (let i = 1; i < p.weeks.length; i++) expect(p.weeks[i].openingBalanceCents).toBe(p.weeks[i - 1].closingBalanceCents);
  });
});

describe("11. negative balances", () => {
  it("lowest balance, firstNegativeDate, hasNegative, negativeDayCount", () => {
    // $100 start; -$150 on 01-03 -> -$50 (01-03..01-05); +$100 on 01-06 -> $50; -$20 on 01-08 -> $30
    const p = run({
      settings: settings({ startingBalanceCents: 10000, forecastDays: 10 }),
      bills: [bill("big", 15000, "ONE_TIME", "2025-01-03"), bill("small", 2000, "ONE_TIME", "2025-01-08")],
      incomes: [income("pay", 10000, "ONE_TIME", "2025-01-06")],
    });
    expect(p.totals).toMatchObject({
      lowestBalanceCents: -5000,
      lowestBalanceDate: "2025-01-03",
      firstNegativeDate: "2025-01-03",
      negativeDayCount: 3,
      endingBalanceCents: 3000,
    });
    expect(p.weeks.map((w) => [w.lowestBalanceCents, w.hasNegative])).toEqual([
      [-5000, true], // 12-29..01-04
      [-5000, true], // 01-05..01-10: 01-05 ends at -$50
    ]);
  });

  it("negative or zero starting balance", () => {
    const neg = run({ settings: settings({ startingBalanceCents: -1000, forecastDays: 7 }) });
    expect(neg.totals).toMatchObject({ lowestBalanceCents: -1000, firstNegativeDate: "2025-01-01", negativeDayCount: 7 });
    const zero = run({ settings: settings({ startingBalanceCents: 0, forecastDays: 7 }) });
    expect(zero.totals).toMatchObject({ lowestBalanceCents: 0, firstNegativeDate: null, negativeDayCount: 0 });
    expect(zero.weeks.every((w) => !w.hasNegative)).toBe(true);
  });

  it("lowest balance uses end-of-day balances (an intra-day dip doesn't count)", () => {
    // income $500 and bill $1,200 on the same day from $1,000: end-of-day = $300; never negative at end of day
    const p = run({
      settings: settings({ forecastDays: 7 }),
      incomes: [income("pay", 50000, "ONE_TIME", "2025-01-02")],
      bills: [bill("rent", 120000, "ONE_TIME", "2025-01-02")],
    });
    expect(p.totals.lowestBalanceCents).toBe(30000);
    expect(p.totals.firstNegativeDate).toBeNull();
  });
});

describe("13/14. occurrence status and overrides", () => {
  const base = { bills: [bill("rent", 20000, "MONTHLY", "2025-01-10")] }; // 01-10, 02-10, 03-10

  it("13. PAID is counted exactly once, same totals as UPCOMING", () => {
    const upcoming = run(base);
    const paid = run({ ...base, occurrences: [occ("rent", "2025-02-10", "PAID")] });
    expect(upcoming.totals.endingBalanceCents).toBe(40000); // 1000 - 3 x 200
    expect(paid.totals).toEqual(upcoming.totals);
    expect(paid.events).toHaveLength(3);
    expect(paid.events[1]).toMatchObject({ status: "PAID", included: true, signedAmountCents: -20000 });
  });

  it("14. SKIPPED is excluded but visible; later occurrences remain", () => {
    const p = run({ ...base, occurrences: [occ("rent", "2025-02-10", "SKIPPED")] });
    expect(p.events).toHaveLength(3);
    const skipped = p.events.find((e) => e.date === "2025-02-10")!;
    expect(skipped).toMatchObject({ status: "SKIPPED", included: false, signedAmountCents: 0, amountCents: 20000, balanceAfterCents: 80000 });
    expect(p.events.find((e) => e.date === "2025-03-10")).toMatchObject({ included: true, balanceAfterCents: 60000 });
    expect(p.totals.endingBalanceCents).toBe(60000); // $200 more than with UPCOMING
    expect(p.days.find((d) => d.date === "2025-02-10")).toMatchObject({ billsCents: 0, closingBalanceCents: 80000 });
    expect(p.days.find((d) => d.date === "2025-02-10")!.eventIds).toEqual(["BILL:rent:2025-02-10"]);
  });

  it("amount override applies to that one occurrence only", () => {
    const p = run({ ...base, occurrences: [occ("rent", "2025-01-10", "UPCOMING", 25000)] });
    expect(p.events.map((e) => [e.amountCents, e.amountOverridden])).toEqual([
      [25000, true],
      [20000, false],
      [20000, false],
    ]);
    expect(p.totals.endingBalanceCents).toBe(35000); // 1000 - 250 - 200 - 200
  });

  it("PAID with override counts the override once; SKIPPED with override counts nothing", () => {
    const paid = run({ ...base, occurrences: [occ("rent", "2025-01-10", "PAID", 21234)] });
    expect(paid.totals.endingBalanceCents).toBe(100000 - 21234 - 40000);
    const skipped = run({ ...base, occurrences: [occ("rent", "2025-01-10", "SKIPPED", 21234)] });
    expect(skipped.events[0]).toMatchObject({ amountCents: 21234, signedAmountCents: 0, included: false });
    expect(skipped.totals.endingBalanceCents).toBe(60000);
  });

  it("an occurrence row for a non-scheduled date has no effect", () => {
    const p = run({ ...base, occurrences: [occ("rent", "2025-01-11", "PAID", 99999), occ("ghost", "2025-01-10", "SKIPPED")] });
    expect(p.events).toHaveLength(3);
    expect(p.totals.endingBalanceCents).toBe(40000);
  });
});

describe("15. decimal amounts reconcile exactly", () => {
  it("$12.99 weekly x 4 = $51.96", () => {
    const p = run({ settings: settings({ forecastDays: 28 }), bills: [bill("sub", 1299, "WEEKLY", "2025-01-01")] });
    expect(p.totals.billsCents).toBe(5196);
    expect(p.totals.endingBalanceCents).toBe(94804);
  });

  it("$0.10 many times", () => {
    // 300 one-time $0.10 bills spread across the window = $30.00; weekly $0.10 income over 364 days = 52 x 10
    const bills = Array.from({ length: 300 }, (_, i) => bill(`b${i}`, 10, "ONE_TIME", oracleAddDays("2025-01-01", i % 364)));
    const p = run({
      settings: settings({ forecastDays: 364 }),
      bills,
      incomes: [income("dime", 10, "WEEKLY", "2025-01-01")],
    });
    expect(p.totals.billsCents).toBe(3000);
    expect(p.totals.incomeCents).toBe(520);
    expect(p.totals.endingBalanceCents).toBe(100000 - 3000 + 520);
  });
});

describe("window, clamping, slicing (17)", () => {
  const rich = () =>
    input({
      settings: settings({ forecastDays: 90 }),
      incomes: [income("bw", 150000, "BIWEEKLY", "2025-01-03"), income("bonus", 33333, "ONE_TIME", "2025-02-14")],
      bills: [
        bill("rent", 120000, "MONTHLY", "2025-01-31"),
        bill("gym", 2999, "WEEKLY", "2024-12-30"),
        bill("ins", 45050, "QUARTERLY", "2024-11-15"),
        bill("yr", 9900, "YEARLY", "2025-01-01"),
      ],
      occurrences: [occ("gym", "2025-01-13", "SKIPPED"), occ("rent", "2025-02-28", "PAID", 125000)],
    });

  it("default range is the full window; window/maxEndDate per section 3", () => {
    const p = computeProjection(rich());
    assertReconciled(p);
    expect(p.window).toEqual({ startDate: "2025-01-01", endDate: "2025-03-31", maxEndDate: "2026-01-01" });
    expect(p.range).toEqual({ from: "2025-01-01", to: "2025-03-31" });
    expect(p.days).toHaveLength(90);
  });

  it("from before the start is clamped; to beyond maxEndDate is clamped", () => {
    const p = computeProjection({ ...rich(), from: "2024-06-01", to: "2027-01-01" });
    assertReconciled(p);
    expect(p.range).toEqual({ from: "2025-01-01", to: "2026-01-01" });
    // yearly bill on 2025-01-01 recurs on 2026-01-01 (maxEndDate, inclusive) and no later
    expect(p.events.filter((e) => e.sourceId === "yr").map((e) => e.date)).toEqual(["2025-01-01", "2026-01-01"]);
    expect(p.days[0].openingBalanceCents).toBe(100000);
  });

  it("to beyond the forecast window (but within maxEndDate) is honored", () => {
    const p = computeProjection({ ...rich(), from: "2025-04-01", to: "2025-06-30" });
    assertReconciled(p);
    expect(p.range).toEqual({ from: "2025-04-01", to: "2025-06-30" });
  });

  it("366-day forecast", () => {
    const p = computeProjection({ ...rich(), settings: settings({ forecastDays: 366 }) });
    assertReconciled(p);
    expect(p.window.endDate).toBe("2026-01-01");
    expect(p.days).toHaveLength(366);
  });

  it("slices equal the full computation; adjacent slices never duplicate or drop events", () => {
    const full = computeProjection({ ...rich(), to: "2026-01-01" });
    assertReconciled(full);
    const cuts = ["2025-01-01", "2025-01-20", "2025-02-10", "2025-02-28", "2025-05-31", "2026-01-01"];
    const seen: string[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = i === 0 ? cuts[i] : oracleAddDays(cuts[i], 1);
      const slice = computeProjection({ ...rich(), from, to: cuts[i + 1] });
      assertReconciled(slice);
      const expectedDays = full.days.filter((d) => d.date >= from && d.date <= cuts[i + 1]);
      expect(slice.days).toEqual(expectedDays);
      expect(slice.events).toEqual(full.events.filter((e) => e.date >= from && e.date <= cuts[i + 1]));
      seen.push(...slice.events.map((e) => e.id));
    }
    expect(seen).toEqual(full.events.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("matches the brute-force oracle on the full range", () => {
    const inp = rich();
    const p = computeProjection({ ...inp, to: "2026-01-01" });
    const oracle = oracleClosings(inp, "2026-01-01");
    for (const d of p.days) expect(d.closingBalanceCents, d.date).toBe(oracle.get(d.date));
  });
});

describe("21. randomized invariants", () => {
  const IF = ["WEEKLY", "BIWEEKLY", "ONE_TIME"] as const;
  const BF = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

  it("60 random scenarios: invariants, oracle balances, slice consistency", () => {
    const r = rng(20251023);
    for (let n = 0; n < 60; n++) {
      const start = oracleAddDays("2024-01-01", r.int(0, 1200));
      const st = settings({
        projectionStartDate: start,
        startingBalanceCents: r.int(-500000, 2000000),
        forecastDays: r.int(7, 366),
        weekStartsOn: r.int(0, 6),
      });
      const incomes = Array.from({ length: r.int(0, 4) }, (_, i) =>
        income(`i${i}`, r.int(1, 500000), r.pick(IF), oracleAddDays(start, r.int(-200, 200)), {
          name: r.pick(["Pay", "pay", "Side", "Bonus"]),
          endDate: r.bool(0.2) ? oracleAddDays(start, r.int(0, 300)) : null,
          active: r.bool(0.9),
        }),
      );
      const bills = Array.from({ length: r.int(0, 12) }, (_, i) =>
        bill(`b${i}`, r.int(1, 300000), r.pick(BF), oracleAddDays(start, r.int(-400, 200)), {
          name: r.pick(["Rent", "rent", "Gym", "Car", "Phone"]),
          endDate: r.bool(0.2) ? oracleAddDays(start, r.int(0, 300)) : null,
          active: r.bool(0.9),
        }),
      );
      const inp0 = input({ settings: st, incomes, bills });
      const pre = computeProjection({ ...inp0, to: oracleAddDays(start, 365) });
      const occurrences = pre.events
        .filter((e) => e.kind === "BILL" && r.bool(0.25))
        .map((e) => occ(e.sourceId, e.date, r.pick(["UPCOMING", "PAID", "SKIPPED"] as const), r.bool(0.4) ? r.int(1, 99999) : null));
      const inp = { ...inp0, occurrences };

      const full = computeProjection({ ...inp, to: oracleAddDays(start, 365) });
      assertReconciled(full);
      const oracle = oracleClosings(inp, full.range.to);
      for (const d of full.days) expect(d.closingBalanceCents, `${n} ${d.date}`).toBe(oracle.get(d.date));

      const def = computeProjection(inp);
      assertReconciled(def);
      expect(def.days).toHaveLength(st.forecastDays);

      const from = oracleAddDays(start, r.int(-30, 300));
      const to = oracleAddDays(from, r.int(0, 120));
      const slice = computeProjection({ ...inp, from, to });
      assertReconciled(slice);
      const byDate = new Map(full.days.map((d) => [d.date, d]));
      for (const d of slice.days) expect(d).toEqual(byDate.get(d.date));
      const fullEv = new Map(full.events.map((e) => [e.id, e]));
      for (const e of slice.events) expect(e).toEqual(fullEv.get(e.id));
    }
  });
});
