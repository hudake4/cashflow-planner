import { describe, expect, it } from "vitest";
import * as demo from "@/app/api/data/demo/route";
import * as reset from "@/app/api/data/reset/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeList from "@/app/api/income/route";
import * as billList from "@/app/api/bills/route";
import * as projectionRoute from "@/app/api/projection/route";
import { todayLocal } from "@/domain/dates";
import type { ProjectionResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { assertReconciled } from "../helpers/invariants";
import { testPrisma } from "../setup/integration-setup";

const post = (h: typeof demo.POST) => call(h as never, "POST", "/api/data");

describe("data management", () => {
  it("POST /api/data/demo replaces everything with labeled demo data", async () => {
    await call(incomeList.POST, "POST", "/api/income", {
      body: { name: "Mine", amountCents: 100, frequency: "WEEKLY", anchorDate: "2025-01-01" },
    });
    const res = await post(demo.POST);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const incomes = (await call(incomeList.GET, "GET", "/api/income")).body as { name: string }[];
    const bills = (await call(billList.GET, "GET", "/api/bills")).body as { name: string }[];
    expect(incomes.length).toBeGreaterThan(0);
    expect(bills.length).toBeGreaterThan(0);
    expect([...incomes, ...bills].every((x) => x.name.startsWith("Demo: "))).toBe(true);

    const s = (await call(settingsRoute.GET, "GET", "/api/settings")).body;
    expect(s).toMatchObject({ startingBalanceCents: 125000, projectionStartDate: todayLocal() });

    const p = await call<ProjectionResponse>(projectionRoute.GET, "GET", "/api/projection");
    expect(p.status).toBe(200);
    assertReconciled(p.body);

    // loading twice does not duplicate
    await post(demo.POST);
    expect((await call(incomeList.GET, "GET", "/api/income")).body).toHaveLength(incomes.length);
  });

  it("POST /api/data/reset deletes everything and restores default settings", async () => {
    await post(demo.POST);
    const res = await post(reset.POST);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await call(incomeList.GET, "GET", "/api/income")).body).toEqual([]);
    expect((await call(billList.GET, "GET", "/api/bills")).body).toEqual([]);
    expect(await testPrisma.billOccurrence.count()).toBe(0);
    const s = (await call(settingsRoute.GET, "GET", "/api/settings")).body;
    expect(s).toMatchObject({ startingBalanceCents: 0, projectionStartDate: todayLocal(), updatedAt: null });
  });
});
