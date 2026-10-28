/**
 * Safe to spend and savings goals (CONVENTIONS section 8). Fixture: start 2025-01-01 (Wed), 30 days,
 * $1,000 opening, +$500 on Fridays, -$10 on Wednesdays. End-of-day balances used below:
 * 01-01 $990 (the lowest from today), 01-08 $1,480, 01-15 $1,970, 01-22 $2,460, 01-29 and 01-30 $2,950.
 */
import { describe, expect, it } from "vitest";
import type { SavingsGoalDTO, SettingsDTO } from "@/contracts/api";
import { buildDashboard } from "@/domain/dashboard";
import { applyGoalReserve } from "@/domain/savings-goals";
import { bill, income, occ, settings } from "../helpers/fixtures";

const fullSettings = (over: Partial<SettingsDTO> = {}): SettingsDTO => ({
  ...settings({ forecastDays: 30 }),
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 0, debtMonthlyPaymentCents: 50000,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  accountsBalanceDate: null,
  accountsStaleCount: 0,
  updatedAt: null,
  ...over,
});

const goal = (id: string, targetAmountCents: number, targetDate: string, name: string | null = id): SavingsGoalDTO => ({
  id,
  name,
  targetAmountCents,
  targetDate,
  createdAt: "x",
  updatedAt: "x",
});

const base = {
  incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
  bills: [bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" })],
  occurrences: [] as ReturnType<typeof occ>[],
};

const dash = (goals?: SavingsGoalDTO[], over: Partial<SettingsDTO> = {}, today = "2025-01-01") =>
  buildDashboard({ ...base, settings: fullSettings(over), goals, today });

describe("safe to spend with savings goals", () => {
  it("no goals: the plain floor figure and an empty reserve", () => {
    for (const d of [dash(), dash([])]) {
      expect(d.safeToSpendCents).toBe(99000);
      expect(d.goalReserve).toEqual({ setAsideCents: 0, goals: [], limitedBy: null });
    }
  });

  it("unsupported goal: weekly set-aside = ceil(shortfall / weeks left) comes off the top", () => {
    // 01-29 balance $2,950 vs $4,000 target: $1,050 short over ceil(28 / 7) = 4 weeks -> $262.50/week.
    const d = dash([goal("car", 400000, "2025-01-29", "Car")]);
    expect(d.goalReserve.goals).toEqual([
      {
        id: "car",
        name: "Car",
        targetAmountCents: 400000,
        targetDate: "2025-01-29",
        shortfallCents: 105000,
        weeksRemaining: 4,
        weeklySetAsideCents: 26250,
      },
    ]);
    expect(d.goalReserve.setAsideCents).toBe(26250);
    expect(d.goalReserve.limitedBy).toBeNull();
    expect(d.safeToSpendCents).toBe(99000 - 26250);
  });

  it("rounds the set-aside up to a whole cent", () => {
    // Past the window the last balance ($2,950) is used: 59 days -> 9 weeks, 105000 / 9 = 11666.7.
    const d = dash([goal("trip", 400000, "2025-03-01")]);
    expect(d.goalReserve.goals[0]).toMatchObject({ weeksRemaining: 9, weeklySetAsideCents: 11667 });
    expect(d.safeToSpendCents).toBe(99000 - 11667);
  });

  it("supported goal: no set-aside, but safe to spend is capped at its headroom", () => {
    // 01-15 balance $1,970 vs $1,500 target -> $470 of headroom, tighter than the $990 above the floor.
    const d = dash([goal("fund", 150000, "2025-01-15", "Fund")]);
    expect(d.goalReserve.setAsideCents).toBe(0);
    expect(d.goalReserve.goals).toEqual([]);
    expect(d.goalReserve.limitedBy).toEqual({ id: "fund", name: "Fund", headroomCents: 47000 });
    expect(d.safeToSpendCents).toBe(47000);
  });

  it("supported goal with more headroom than the floor figure does not limit anything", () => {
    const d = dash([goal("small", 10000, "2025-01-15")]);
    expect(d.goalReserve.limitedBy).toBeNull();
    expect(d.safeToSpendCents).toBe(99000);
  });

  it("a goal met exactly has zero headroom, so nothing is safe to spend", () => {
    const d = dash([goal("exact", 197000, "2025-01-15")]);
    expect(d.goalReserve.limitedBy).toMatchObject({ headroomCents: 0 });
    expect(d.safeToSpendCents).toBe(0);
  });

  it("past-due goals are ignored; a goal due today needs its whole shortfall", () => {
    // today 01-08: lowest future balance is $1,480.
    const past = dash([goal("old", 999999, "2025-01-07")], {}, "2025-01-08");
    expect(past.goalReserve).toEqual({ setAsideCents: 0, goals: [], limitedBy: null });
    expect(past.safeToSpendCents).toBe(148000);

    const today = dash([goal("now", 200000, "2025-01-08")], {}, "2025-01-08");
    expect(today.goalReserve.goals[0]).toMatchObject({ weeksRemaining: 0, shortfallCents: 52000, weeklySetAsideCents: 52000 });
    expect(today.safeToSpendCents).toBe(148000 - 52000);
  });

  it("multiple goals: set-asides add up, soonest target date first; the tightest supported goal caps", () => {
    const goals = [
      goal("car", 400000, "2025-01-29", "Car"), // 4 weeks, $1,050 short -> 26250
      goal("fund", 150000, "2025-01-15", "Fund"), // supported, headroom 47000
      goal("roof", 300000, "2025-01-22", "Roof"), // 3 weeks, $540 short -> 18000
      goal("spare", 100000, "2025-01-22", "Spare"), // supported, headroom 146000
    ];
    const d = dash(goals);
    expect(d.goalReserve.goals.map((g) => [g.id, g.weeklySetAsideCents])).toEqual([
      ["roof", 18000],
      ["car", 26250],
    ]);
    expect(d.goalReserve.setAsideCents).toBe(44250);
    expect(d.goalReserve.limitedBy).toEqual({ id: "fund", name: "Fund", headroomCents: 47000 });
    expect(d.safeToSpendCents).toBe(47000 - 44250);
    // Input order does not matter.
    expect(dash([...goals].reverse()).goalReserve).toEqual(d.goalReserve);
  });

  it("a set-aside bigger than what is available clamps to zero", () => {
    const d = dash([goal("house", 5_000_000, "2025-01-29")]);
    expect(d.goalReserve.setAsideCents).toBeGreaterThan(99000);
    expect(d.safeToSpendCents).toBe(0);
  });

  it("with a balance floor, the set-aside comes out of money above the floor", () => {
    // $990 - $500 floor = $490 above the floor.
    const floor = { balanceFloorCents: 50000 };
    expect(dash([], floor).safeToSpendCents).toBe(49000);
    expect(dash([goal("car", 400000, "2025-01-29")], floor).safeToSpendCents).toBe(49000 - 26250);
    // Headroom of $470 is tighter than $490, so it limits; headroom of $600 is not.
    const tight = dash([goal("fund", 150000, "2025-01-15")], floor);
    expect(tight.goalReserve.limitedBy).toMatchObject({ headroomCents: 47000 });
    expect(tight.safeToSpendCents).toBe(47000);
    const loose = dash([goal("fund", 137000, "2025-01-15")], floor);
    expect(loose.goalReserve.limitedBy).toBeNull();
    expect(loose.safeToSpendCents).toBe(49000);
  });

  it("a floor above the lowest balance still gives zero, goals or not", () => {
    const floor = { balanceFloorCents: 200000 };
    expect(dash([goal("car", 400000, "2025-01-29")], floor).safeToSpendCents).toBe(0);
    expect(dash([], floor).safeToSpendCents).toBe(0);
  });

  it("spending the safe amount never leaves a supported goal unsupported", () => {
    const g = goal("fund", 150000, "2025-01-15");
    const spent = dash([g]).safeToSpendCents;
    const after = buildDashboard({
      ...base,
      settings: fullSettings({ startingBalanceCents: 100000 - spent }),
      goals: [g],
      today: "2025-01-01",
    });
    expect(after.goalReserve.goals).toEqual([]);
    expect(after.goalReserve.limitedBy).toMatchObject({ headroomCents: 0 });
  });
});

describe("applyGoalReserve", () => {
  it("takes the tighter of the floor figure and the headroom, then subtracts the set-aside", () => {
    const reserve = (setAsideCents: number, headroomCents?: number) => ({
      setAsideCents,
      goals: [],
      limitedBy: headroomCents === undefined ? null : { id: "g", name: "G", headroomCents },
    });
    expect(applyGoalReserve(1000, reserve(0))).toBe(1000);
    expect(applyGoalReserve(1000, reserve(0, 400))).toBe(400);
    expect(applyGoalReserve(1000, reserve(100, 400))).toBe(300);
    expect(applyGoalReserve(1000, reserve(2000))).toBe(0);
    expect(applyGoalReserve(-500, reserve(0))).toBe(0);
  });
});
