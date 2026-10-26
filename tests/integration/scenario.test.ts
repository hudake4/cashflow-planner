/**
 * Scenario (what-if) endpoints over real persisted data. Same fixture as
 * projection.test.ts: start 2025-01-01 (Wed), $1,000.00, 90 days, plus a
 * biweekly $500 income and a monthly $200 bill.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeList from "@/app/api/income/route";
import * as billList from "@/app/api/bills/route";
import * as scenarioDashboard from "@/app/api/dashboard/scenario/route";
import * as scenarioProjection from "@/app/api/projection/scenario/route";
import type { DashboardResponse, ProjectionResponse } from "@/contracts/api";
import { call, expectApiError } from "../helpers/api";

const SETTINGS = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 0,
};

let payId: string;
let rentId: string;

beforeEach(async () => {
  expect((await call(settingsRoute.PUT, "PUT", "/api/settings", { body: SETTINGS })).status).toBe(200);
  // biweekly $500 from 01-03: $3,500 over the window
  payId = (
    await call(incomeList.POST, "POST", "/api/income", {
      body: { name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" },
    })
  ).body.id;
  // monthly $200 on the 10th: $600 over the window
  rentId = (
    await call(billList.POST, "POST", "/api/bills", {
      body: { name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10" },
    })
  ).body.id;
});

describe("POST /api/dashboard/scenario", () => {
  it("ADD_BILL adds a one-time bill to the totals", async () => {
    const res = await call<DashboardResponse>(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "ADD_BILL", name: "Extra", amountCents: 5000, date: "2025-01-15" } },
    });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ billsCents: 65000, incomeCents: 350000, endingBalanceCents: 385000 });
  });

  it("ADD_INCOME adds a one-time income to the totals", async () => {
    const res = await call<DashboardResponse>(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "ADD_INCOME", name: "Bonus", amountCents: 10000, date: "2025-01-20" } },
    });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ incomeCents: 360000, billsCents: 60000, endingBalanceCents: 400000 });
  });

  it("REMOVE_BILL removes the bill from the totals", async () => {
    const res = await call<DashboardResponse>(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "REMOVE_BILL", id: rentId } },
    });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ billsCents: 0, endingBalanceCents: 450000 });
  });

  it("REMOVE_INCOME removes the income from the totals", async () => {
    const res = await call<DashboardResponse>(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "REMOVE_INCOME", id: payId } },
    });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ incomeCents: 0, endingBalanceCents: 40000 });
  });

  it("rejects a zero amount (400 VALIDATION_ERROR)", async () => {
    const res = await call(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "ADD_BILL", amountCents: 0, date: "2025-01-15" } },
    });
    expectApiError(res, 400, "VALIDATION_ERROR", ["amountCents"]);
  });

  it("rejects an empty date (400 VALIDATION_ERROR)", async () => {
    const res = await call(scenarioDashboard.POST, "POST", "/api/dashboard/scenario", {
      body: { scenario: { kind: "ADD_BILL", amountCents: 100, date: "" } },
    });
    expectApiError(res, 400, "VALIDATION_ERROR", ["date"]);
  });
});

describe("POST /api/projection/scenario", () => {
  it("applies the scenario to the requested projection range", async () => {
    const res = await call<ProjectionResponse>(scenarioProjection.POST, "POST", "/api/projection/scenario", {
      body: {
        scenario: { kind: "ADD_BILL", name: "Extra", amountCents: 5000, date: "2025-01-15" },
        from: "2025-01-01",
        to: "2025-03-31",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ billsCents: 65000, endingBalanceCents: 385000 });
  });
});
