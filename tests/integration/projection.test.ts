/**
 * Projection/dashboard endpoints over real persisted data. Settings: start
 * 2025-01-01 (Wed), $1,000.00, 90 days (window ..2025-03-31), weeks start Sunday.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeList from "@/app/api/income/route";
import * as incomeItem from "@/app/api/income/[id]/route";
import * as billList from "@/app/api/bills/route";
import * as billItem from "@/app/api/bills/[id]/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import * as projectionRoute from "@/app/api/projection/route";
import * as dashboardRoute from "@/app/api/dashboard/route";
import type { DashboardResponse, ProjectionResponse } from "@/contracts/api";
import { call, expectApiError } from "../helpers/api";
import { assertReconciled } from "../helpers/invariants";

const SETTINGS = {
  startingBalanceCents: 100000,
  projectionStartDate: "2025-01-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
};
const projection = async (qs = "") => {
  const res = await call<ProjectionResponse>(projectionRoute.GET, "GET", `/api/projection${qs}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  assertReconciled(res.body);
  return res.body;
};
const closing = (p: ProjectionResponse, date: string) => p.days.find((d) => d.date === date)!.closingBalanceCents;

let payId: string;
let rentId: string;

beforeEach(async () => {
  expect((await call(settingsRoute.PUT, "PUT", "/api/settings", { body: SETTINGS })).status).toBe(200);
  // biweekly $500 from 01-03: 01-03, 01-17, 01-31, 02-14, 02-28, 03-14, 03-28 (7 x $500 = $3,500)
  payId = (
    await call(incomeList.POST, "POST", "/api/income", {
      body: { name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03" },
    })
  ).body.id;
  // monthly $200 on the 10th: 01-10, 02-10, 03-10 (3 x $200 = $600)
  rentId = (
    await call(billList.POST, "POST", "/api/bills", {
      body: { name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10" },
    })
  ).body.id;
});

describe("GET /api/projection", () => {
  it("returns the full reconciled window with hand-computed balances", async () => {
    const p = await projection();
    expect(p.window).toEqual({ startDate: "2025-01-01", endDate: "2025-03-31", maxEndDate: "2026-01-01" });
    expect(p.days).toHaveLength(90);
    expect(closing(p, "2025-01-03")).toBe(150000);
    expect(closing(p, "2025-01-10")).toBe(130000);
    // $1,000 + $3,500 - $600 = $3,900
    expect(p.totals).toMatchObject({ incomeCents: 350000, billsCents: 60000, endingBalanceCents: 390000 });
  });

  it("from/to slicing and clamping; slices match the full projection", async () => {
    const full = await projection("?to=2026-01-01");
    expect(full.range.to).toBe("2026-01-01");
    const slice = await projection("?from=2025-02-01&to=2025-02-28");
    expect(slice.range).toEqual({ from: "2025-02-01", to: "2025-02-28" });
    expect(slice.days).toEqual(full.days.filter((d) => d.date >= "2025-02-01" && d.date <= "2025-02-28"));
    const clamped = await projection("?from=2024-01-01&to=2030-01-01");
    expect(clamped.range).toEqual({ from: "2025-01-01", to: "2026-01-01" });
    expect(clamped.days).toHaveLength(366);
  });

  it("400 for invalid query dates or from > to", async () => {
    for (const qs of ["?from=2025-02-30", "?to=abc", "?from=2025-03-01&to=2025-02-01"]) {
      expectApiError(await call(projectionRoute.GET, "GET", `/api/projection${qs}`), 400, "VALIDATION_ERROR");
    }
  });

  it("13/14. PAID leaves the balance unchanged; SKIPPED adds the amount back; DELETE restores", async () => {
    const base = (await projection()).totals.endingBalanceCents; // 390000
    const put = (status: string) =>
      call(occItem.PUT, "PUT", "", { body: { status }, params: { id: rentId, date: "2025-02-10" } });

    expect((await put("PAID")).status).toBe(200);
    const paid = await projection();
    expect(paid.totals.endingBalanceCents).toBe(base);
    expect(paid.events.filter((e) => e.sourceId === rentId)).toHaveLength(3);

    expect((await put("SKIPPED")).status).toBe(200);
    const skipped = await projection();
    expect(skipped.totals.endingBalanceCents).toBe(base + 20000);
    expect(skipped.events.find((e) => e.id === `BILL:${rentId}:2025-02-10`)).toMatchObject({ included: false, signedAmountCents: 0 });
    expect(skipped.events.find((e) => e.id === `BILL:${rentId}:2025-03-10`)).toMatchObject({ included: true });

    await call(occItem.DELETE, "DELETE", "", { params: { id: rentId, date: "2025-02-10" } });
    expect((await projection()).totals.endingBalanceCents).toBe(base);
  });

  it("override changes only that occurrence", async () => {
    await call(occItem.PUT, "PUT", "", { body: { status: "UPCOMING", amountOverrideCents: 23456 }, params: { id: rentId, date: "2025-01-10" } });
    const p = await projection();
    expect(p.totals.billsCents).toBe(23456 + 20000 + 20000);
  });

  it("18. deactivating / deleting items updates the projection", async () => {
    await call(billItem.PUT, "PUT", "", {
      body: { name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10", active: false },
      params: { id: rentId },
    });
    expect((await projection()).totals).toMatchObject({ billsCents: 0, endingBalanceCents: 450000 });

    await call(incomeItem.DELETE, "DELETE", "", { params: { id: payId } });
    const p = await projection();
    expect(p.events).toEqual([]);
    expect(p.totals.endingBalanceCents).toBe(100000);
  });

  it("endDate on income is honored inclusively", async () => {
    await call(incomeItem.PUT, "PUT", "", {
      body: { name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03", endDate: "2025-01-17" },
      params: { id: payId },
    });
    expect((await projection()).totals.incomeCents).toBe(100000); // 01-03 and 01-17
  });
});

describe("GET /api/dashboard", () => {
  it("returns data consistent with the projection", async () => {
    const res = await call<DashboardResponse>(dashboardRoute.GET, "GET", "/api/dashboard");
    expect(res.status).toBe(200);
    const d = res.body;
    const p = await projection();
    expect(d.settings).toMatchObject(SETTINGS);
    expect(d.window).toEqual({ startDate: "2025-01-01", endDate: "2025-03-31" });
    expect(d.totals).toEqual(p.totals);
    expect(d.trend).toEqual(p.days.map((x) => ({ date: x.date, balanceCents: x.closingBalanceCents })));
    expect(d.hasData).toBe(true);
    // today (2026+) is after the 2025 window -> reference = window end 2025-03-31
    expect(d.currentWeek).toMatchObject({ weekStart: "2025-03-30", rangeEnd: "2025-03-31" });
    expect(d.nextWeek).toBeNull();
  });
});
