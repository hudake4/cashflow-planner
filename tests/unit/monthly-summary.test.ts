/** Monthly summary (CONVENTIONS section 18). Fixture: start 2025-01-01, $1,000 opening, 90 days. */
import { describe, expect, it } from "vitest";
import { buildMonthlySummary, monthBounds, monthLabel } from "@/domain/monthly-summary";
import { computeProjection } from "@/domain/projection";
import { bill, income, input, occ, settings } from "../helpers/fixtures";

const summaryFor = (month: string, over: Parameters<typeof input>[0] = {}) => {
  const { from, to } = monthBounds(month);
  return buildMonthlySummary(month, computeProjection({ ...input(over), from, to }));
};

describe("monthBounds / monthLabel", () => {
  it("handles month lengths and leap years", () => {
    expect(monthBounds("2025-02")).toEqual({ from: "2025-02-01", to: "2025-02-28" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2025-12")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(monthLabel("2025-02")).toBe("February 2025");
  });
});

describe("buildMonthlySummary", () => {
  const base = {
    incomes: [income("pay", 50000, "BIWEEKLY", "2025-01-03", { name: "Paycheck" }), income("side", 7500, "MONTHLY", "2025-02-10", { name: "Side gig" })],
    bills: [
      bill("rent", 20000, "MONTHLY", "2025-01-10", { name: "Rent", category: "Housing" }),
      bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym", category: "Health" }),
      bill("misc", 2500, "MONTHLY", "2025-02-20", { name: "Misc" }),
    ],
  };

  it("takes totals from the engine and carries the previous month's closing as the opening", () => {
    const jan = summaryFor("2025-01", base);
    const feb = summaryFor("2025-02", base);
    expect(jan.partial).toBe(false);
    expect(jan.range).toEqual({ from: "2025-01-01", to: "2025-01-31" });
    // Jan: pay 01-03, 01-17, 01-31 = $1,500; rent $200; gym 01-01,08,15,22,29 = $50.
    expect(jan.totals).toMatchObject({ openingBalanceCents: 100000, incomeCents: 150000, billsCents: 25000, netCents: 125000, endingBalanceCents: 225000 });
    expect(feb.totals.openingBalanceCents).toBe(jan.totals.endingBalanceCents);
    expect(feb.totals.openingBalanceCents + feb.totals.netCents).toBe(feb.totals.endingBalanceCents);
  });

  it("groups income by source and bills by category, largest first, uncategorized as null", () => {
    const feb = summaryFor("2025-02", base);
    // Feb: pay 02-14, 02-28 = $1,000; side $75.
    expect(feb.incomeBySource).toEqual([
      { label: "Paycheck", amountCents: 100000, count: 2 },
      { label: "Side gig", amountCents: 7500, count: 1 },
    ]);
    // Feb: rent $200; gym 02-05,12,19,26 = $40; misc $25.
    expect(feb.billsByCategory).toEqual([
      { label: "Housing", amountCents: 20000, count: 1 },
      { label: "Health", amountCents: 4000, count: 4 },
      { label: null, amountCents: 2500, count: 1 },
    ]);
    expect(feb.billsByCategory.reduce((s, g) => s + g.amountCents, 0)).toBe(feb.totals.billsCents);
    expect(feb.incomeBySource.reduce((s, g) => s + g.amountCents, 0)).toBe(feb.totals.incomeCents);
  });

  it("uses the paid override, and leaves skipped bills out of every total and group", () => {
    const jan = summaryFor("2025-01", {
      ...base,
      occurrences: [occ("rent", "2025-01-10", "PAID", 19000), occ("gym", "2025-01-08", "SKIPPED"), occ("gym", "2025-01-15", "SKIPPED")],
    });
    // Rent $190 + gym 3 x $10 = $220.
    expect(jan.totals.billsCents).toBe(22000);
    expect(jan.skippedBillCount).toBe(2);
    expect(jan.skippedBillsCents).toBe(2000);
    expect(jan.billsByCategory.find((g) => g.label === "Housing")).toEqual({ label: "Housing", amountCents: 19000, count: 1 });
    expect(jan.billsByCategory.find((g) => g.label === "Health")).toEqual({ label: "Health", amountCents: 3000, count: 3 });
  });

  it("treats a blank category as uncategorized and breaks amount ties by label", () => {
    const s = summaryFor("2025-01", {
      bills: [
        bill("a", 1000, "ONE_TIME", "2025-01-02", { category: "Zed" }),
        bill("b", 1000, "ONE_TIME", "2025-01-03", { category: "Alpha" }),
        bill("c", 1000, "ONE_TIME", "2025-01-04", { category: "  " }),
      ],
    });
    expect(s.billsByCategory.map((g) => g.label)).toEqual([null, "Alpha", "Zed"]);
  });

  it("marks a month cut by the projection start as partial and covers only the window", () => {
    const s = summaryFor("2025-01", { settings: settings({ projectionStartDate: "2025-01-20" }), bills: [bill("x", 100, "WEEKLY", "2025-01-01")] });
    expect(s.partial).toBe(true);
    expect(s.range).toEqual({ from: "2025-01-20", to: "2025-01-31" });
    expect(s.totals.openingBalanceCents).toBe(100000);
  });

  it("reports the lowest balance and the days below zero", () => {
    const s = summaryFor("2025-01", { settings: settings({ startingBalanceCents: 1000 }), bills: [bill("b", 5000, "ONE_TIME", "2025-01-10")] });
    expect(s.totals).toMatchObject({ lowestBalanceCents: -4000, lowestBalanceDate: "2025-01-10", firstNegativeDate: "2025-01-10", negativeDayCount: 22 });
  });

  it("returns the engine's weeks, clipped to the month", () => {
    const s = summaryFor("2025-01", base);
    expect(s.weeks[0]).toMatchObject({ weekStart: "2024-12-29", rangeStart: "2025-01-01", partial: true });
    expect(s.weeks.at(-1)).toMatchObject({ rangeEnd: "2025-01-31", partial: true });
  });

  it("is empty but valid for a month with nothing scheduled", () => {
    const s = summaryFor("2025-02");
    expect(s.incomeBySource).toEqual([]);
    expect(s.billsByCategory).toEqual([]);
    expect(s.totals).toMatchObject({ incomeCents: 0, billsCents: 0, openingBalanceCents: 100000, endingBalanceCents: 100000 });
  });
});
