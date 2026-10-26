/**
 * Dashboard (CONVENTIONS section 8). Fixture: start 2025-01-01 (Wed), 30 days
 * (window 2025-01-01..2025-01-30), weeks start Sunday, $1,000 opening.
 */
import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/domain/dashboard";
import { computeProjection } from "@/domain/projection";
import type { SettingsDTO } from "@/contracts/api";
import { bill, income, occ, settings } from "../helpers/fixtures";

const fullSettings = (over: Partial<SettingsDTO> = {}): SettingsDTO => ({
  ...settings({ forecastDays: 30 }),
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 0,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  accountsBalanceDate: null,
  accountsStaleCount: 0,
  updatedAt: null,
  ...over,
});

const base = {
  incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })], // 01-03, 10, 17, 24
  bills: [bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" })], // 01-01, 08, 15, 22, 29
  occurrences: [] as ReturnType<typeof occ>[],
};

describe("buildDashboard", () => {
  it("today before the start -> reference is the start date", () => {
    const d = buildDashboard({ ...base, settings: fullSettings(), today: "2024-12-15" });
    expect(d.today).toBe("2024-12-15");
    expect(d.window).toEqual({ startDate: "2025-01-01", endDate: "2025-01-30" });
    expect(d.currentWeek).toMatchObject({ weekStart: "2024-12-29", rangeStart: "2025-01-01", openingBalanceCents: 100000 });
    expect(d.nextWeek).toMatchObject({ weekStart: "2025-01-05" });
    expect(d.nextPaycheck).toEqual({ date: "2025-01-03", name: "Paycheck", amountCents: 50000, sourceId: "pay" });
    // bills in [01-01, 01-14]: gym 01-01, 01-08
    expect(d.upcomingBills.map((e) => e.date)).toEqual(["2025-01-01", "2025-01-08"]);
  });

  it("today inside the window -> week containing today and the next one", () => {
    const d = buildDashboard({ ...base, settings: fullSettings(), today: "2025-01-08" });
    expect(d.currentWeek).toMatchObject({ weekStart: "2025-01-05", weekEnd: "2025-01-11" });
    expect(d.nextWeek).toMatchObject({ weekStart: "2025-01-12", weekEnd: "2025-01-18" });
    expect(d.nextPaycheck?.date).toBe("2025-01-10");
    // [01-08, 01-21]: gym 01-08, 01-15
    expect(d.upcomingBills.map((e) => e.date)).toEqual(["2025-01-08", "2025-01-15"]);
    // current week: opening = $1,000 + $500 (01-03) - $10 (01-01) = $1,490; +$500 (01-10) -$10 (01-08) = $1,980
    expect(d.currentWeek).toMatchObject({ openingBalanceCents: 149000, closingBalanceCents: 198000 });
    expect(d.nextWeek!.openingBalanceCents).toBe(d.currentWeek!.closingBalanceCents);
  });

  it("next paycheck is on or after the reference date", () => {
    const d = buildDashboard({ ...base, settings: fullSettings(), today: "2025-01-10" });
    expect(d.nextPaycheck?.date).toBe("2025-01-10");
  });

  it("today after the window -> reference clamps to the window end", () => {
    const d = buildDashboard({ ...base, settings: fullSettings(), today: "2025-06-01" });
    expect(d.currentWeek).toMatchObject({ weekStart: "2025-01-26", rangeEnd: "2025-01-30" });
    expect(d.nextWeek).toBeNull();
    expect(d.nextPaycheck).toBeNull();
  });

  it("upcoming bills: inclusive 14-day span, excludes skipped, max 8, ledger order", () => {
    const bills = [
      bill("edge-in", 100, "ONE_TIME", "2025-01-21", { name: "Edge in" }), // ref 01-08 + 13
      bill("edge-out", 100, "ONE_TIME", "2025-01-22", { name: "Edge out" }),
      bill("past", 100, "ONE_TIME", "2025-01-07", { name: "Past" }),
      bill("skip", 100, "ONE_TIME", "2025-01-09", { name: "Skip me" }),
    ];
    const d = buildDashboard({
      incomes: [],
      bills,
      occurrences: [occ("skip", "2025-01-09", "SKIPPED")],
      settings: fullSettings(),
      today: "2025-01-08",
    });
    expect(d.upcomingBills.map((e) => e.sourceId)).toEqual(["edge-in"]);

    const many = ["a", "b", "c", "d", "e"].map((n) => bill(n, 100, "WEEKLY", "2025-01-08", { name: n })); // 2 each in span = 10
    const d2 = buildDashboard({ incomes: [], bills: many, occurrences: [], settings: fullSettings(), today: "2025-01-08" });
    expect(d2.upcomingBills).toHaveLength(8);
    expect(d2.upcomingBills.map((e) => `${e.sourceId}:${e.date}`)).toEqual([
      "a:2025-01-08",
      "b:2025-01-08",
      "c:2025-01-08",
      "d:2025-01-08",
      "e:2025-01-08",
      "a:2025-01-15",
      "b:2025-01-15",
      "c:2025-01-15",
    ]);
    expect(d2.upcomingBills.every((e) => e.kind === "BILL")).toBe(true);
  });

  it("totals and trend come from the full forecast window", () => {
    const s = fullSettings();
    const d = buildDashboard({ ...base, settings: s, today: "2025-01-15" });
    const p = computeProjection({ ...base, settings: s });
    expect(d.totals).toEqual(p.totals);
    expect(d.trend).toHaveLength(30);
    expect(d.trend).toEqual(p.days.map((x) => ({ date: x.date, balanceCents: x.closingBalanceCents })));
    // 4 x $500 - 5 x $10 = $1,950 net -> $2,950
    expect(d.totals.endingBalanceCents).toBe(295000);
    expect(d.settings).toEqual(s);
  });

  it("hasData only counts active items", () => {
    const off = buildDashboard({
      incomes: [income("i", 100, "WEEKLY", "2025-01-01", { active: false })],
      bills: [bill("b", 100, "WEEKLY", "2025-01-01", { active: false })],
      occurrences: [],
      settings: fullSettings(),
      today: "2025-01-01",
    });
    expect(off.hasData).toBe(false);
    expect(off.nextPaycheck).toBeNull();
    expect(off.upcomingBills).toEqual([]);
    expect(buildDashboard({ ...base, settings: fullSettings(), today: "2025-01-01" }).hasData).toBe(true);
  });
});
