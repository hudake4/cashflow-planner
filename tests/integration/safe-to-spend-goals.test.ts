/**
 * Safe to spend with savings goals, through the real routes and database (CONVENTIONS section 8).
 * Fixture: start 2025-01-01 (Wed), $1,000.00, 90 days, $100.00 floor, biweekly $500 pay from 01-03
 * and a monthly $200 bill on the 10th. End-of-day balances used below:
 * 01-01 $1,000 (the lowest from 01-01), 01-03 $1,500, 01-10 $1,300, 01-15 $1,300, 01-17 $1,800,
 * 01-31 $2,300, 02-09 $2,300, 02-10 $2,100, 03-31 $3,900 (window end).
 * The dashboard route always uses the real today, so a fixed `today` goes through the scenario route.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeList from "@/app/api/income/route";
import * as billList from "@/app/api/bills/route";
import * as goalList from "@/app/api/savings-goals/route";
import * as goalItem from "@/app/api/savings-goals/[id]/route";
import * as scenarioDashboard from "@/app/api/dashboard/scenario/route";
import type { DashboardResponse, SavingsGoalDTO } from "@/contracts/api";
import { call } from "../helpers/api";

const SETTINGS = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 10000,
};

const dashboard = async (today = "2025-01-01", scenario: unknown = []) => {
  const res = await call<DashboardResponse>(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
    body: { scenario, today },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

const addGoal = async (name: string, targetAmountCents: number, targetDate: string) => {
  const res = await call<SavingsGoalDTO>(goalList.POST, "POST", "/api/savings-goals", {
    body: { name, targetAmountCents, targetDate },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
};

beforeEach(async () => {
  expect((await call(settingsRoute.PUT, "PUT", "/api/settings", { body: SETTINGS })).status).toBe(200);
  await call(incomeList.POST, "POST", "/api/income", {
    body: { name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" },
  });
  await call(billList.POST, "POST", "/api/bills", {
    body: { name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10" },
  });
});

describe("safe to spend with savings goals (API end to end)", () => {
  it("no goals: lowest balance ($1,000) minus the floor ($100)", async () => {
    const d = await dashboard();
    expect(d.safeToSpendCents).toBe(90000);
    expect(d.goalReserve).toEqual({ setAsideCents: 0, goals: [], limitedBy: null });
  });

  it("unsupported goal: $2,000 by 01-15 is $700 short over ceil(14 / 7) = 2 weeks -> $350 set aside", async () => {
    await addGoal("Car", 200000, "2025-01-15");
    const d = await dashboard();
    expect(d.goalReserve.goals).toHaveLength(1);
    expect(d.goalReserve.goals[0]).toMatchObject({
      name: "Car",
      shortfallCents: 70000,
      weeksRemaining: 2,
      weeklySetAsideCents: 35000,
    });
    expect(d.goalReserve.setAsideCents).toBe(35000);
    expect(d.safeToSpendCents).toBe(90000 - 35000);
  });

  it("supported goal: $1,000 by 01-17 has $800 of headroom, which caps the figure below $900", async () => {
    const g = await addGoal("Fund", 100000, "2025-01-17");
    const d = await dashboard();
    expect(d.goalReserve.setAsideCents).toBe(0);
    expect(d.goalReserve.limitedBy).toEqual({ id: g.id, name: "Fund", headroomCents: 80000 });
    expect(d.safeToSpendCents).toBe(80000);
  });

  it("a supported and an unsupported goal together: cap first, then the set-aside", async () => {
    await addGoal("Fund", 100000, "2025-01-17");
    await addGoal("Car", 200000, "2025-01-15");
    const d = await dashboard();
    expect(d.safeToSpendCents).toBe(80000 - 35000);
  });

  it("goal beyond the forecast window uses the last balance: $1,100 short over ceil(151 / 7) = 22 weeks is $50", async () => {
    await addGoal("Far", 500000, "2025-06-01");
    const d = await dashboard();
    expect(d.goalReserve.goals[0]).toMatchObject({ shortfallCents: 110000, weeksRemaining: 22, weeklySetAsideCents: 5000 });
    expect(d.safeToSpendCents).toBe(90000 - 5000);
  });

  it("a goal due before today is ignored; today's lowest balance is $2,100 on 02-10", async () => {
    await addGoal("Old", 9_999_900, "2025-01-31");
    const d = await dashboard("2025-02-01");
    expect(d.goalReserve).toEqual({ setAsideCents: 0, goals: [], limitedBy: null });
    expect(d.safeToSpendCents).toBe(210000 - 10000);
  });

  it("a goal due today needs its whole shortfall (0 weeks left counts as 1)", async () => {
    await addGoal("Now", 200000, "2025-01-15");
    const d = await dashboard("2025-01-15");
    // From 01-15 the lowest balance is $1,300 (01-15); $700 short, all of it this week.
    expect(d.goalReserve.goals[0]).toMatchObject({ weeksRemaining: 0, weeklySetAsideCents: 70000 });
    expect(d.safeToSpendCents).toBe(Math.max(0, 130000 - 10000 - 70000));
  });

  it("clamps to zero when the set-aside exceeds what is available", async () => {
    await addGoal("House", 50_000_000, "2025-01-15");
    expect((await dashboard()).safeToSpendCents).toBe(0);
  });

  it("a floor above the lowest balance gives zero, with or without goals", async () => {
    await call(settingsRoute.PUT, "PUT", "/api/settings", { body: { ...SETTINGS, balanceFloorCents: 150000 } });
    expect((await dashboard()).safeToSpendCents).toBe(0);
    await addGoal("Fund", 100000, "2025-01-17");
    expect((await dashboard()).safeToSpendCents).toBe(0);
  });

  it("editing and deleting goals through the API changes the dashboard", async () => {
    const g = await addGoal("Car", 200000, "2025-01-15");
    expect((await dashboard()).safeToSpendCents).toBe(55000);

    // Lower the target to $1,000: now supported with $300 of headroom on 01-15 ($1,300).
    const put = await call(goalItem.PUT, "PUT", `/api/savings-goals/${g.id}`, {
      body: { name: "Car", targetAmountCents: 100000, targetDate: "2025-01-15" },
      params: { id: g.id },
    });
    expect(put.status).toBe(200);
    const edited = await dashboard();
    expect(edited.goalReserve.setAsideCents).toBe(0);
    expect(edited.safeToSpendCents).toBe(30000);

    const del = await call(goalItem.DELETE, "DELETE", `/api/savings-goals/${g.id}`, { params: { id: g.id } });
    expect(del.status).toBeLessThan(300);
    const gone = await dashboard();
    expect(gone.safeToSpendCents).toBe(90000);
    expect(gone.goalReserve).toEqual({ setAsideCents: 0, goals: [], limitedBy: null });
  });

  it("the what-if dashboard applies the rule to the scenario's projection", async () => {
    await addGoal("Car", 200000, "2025-01-15");
    // A $100 bill on 01-02 lowers every later balance: lowest $900 (-> $800 above the floor);
    // 01-15 is $1,200, so $800 short over 2 weeks = $400. 80000 - 40000.
    const d = await dashboard("2025-01-01", { kind: "ADD_BILL", name: "Extra", amountCents: 10000, date: "2025-01-02" });
    expect(d.goalReserve.goals[0]).toMatchObject({ shortfallCents: 80000, weeklySetAsideCents: 40000 });
    expect(d.safeToSpendCents).toBe(40000);
  });
});
