/** GET /api/alerts over real persisted data (the desktop app polls it for notifications). */
import { beforeEach, describe, expect, it } from "vitest";
import * as settingsRoute from "@/app/api/settings/route";
import * as billList from "@/app/api/bills/route";
import * as alertsRoute from "@/app/api/alerts/route";
import type { AlertsResponse } from "@/contracts/api";
import { addDays, todayLocal } from "@/domain/dates";
import { call } from "../helpers/api";

beforeEach(async () => {
  // The integration setup empties the database between tests (see tests/setup).
  const today = todayLocal();
  const res = await call(settingsRoute.PUT, "PUT", "/api/settings", {
    body: {
      startingBalanceCents: 10000,
      projectionStartDate: today,
      currency: "USD",
      forecastDays: 90,
      weekStartsOn: 0,
      defaultCalendarView: "month",
    },
  });
  expect(res.status).toBe(200);
});

describe("GET /api/alerts", () => {
  it("is empty when nothing is due and the balance stays positive", async () => {
    const res = await call<AlertsResponse>(alertsRoute.GET, "GET", "/api/alerts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ today: todayLocal(), alerts: [] });
  });

  it("reports a bill due soon and the balance it pushes below zero", async () => {
    const due = addDays(todayLocal(), 2);
    const created = await call(billList.POST, "POST", "/api/bills", {
      body: { name: "Rent", amountCents: 120000, frequency: "ONE_TIME", anchorDate: due },
    });
    expect(created.status).toBe(201);

    const res = await call<AlertsResponse>(alertsRoute.GET, "GET", "/api/alerts");
    expect(res.status).toBe(200);
    expect(res.body.alerts.map((a) => a.kind)).toEqual(["LOW_BALANCE", "BILL_DUE"]);
    expect(res.body.alerts[1]).toMatchObject({ key: `bill:${created.body.id}:${due}`, title: "Rent due in 2 days", expiresOn: due });
  });
});
