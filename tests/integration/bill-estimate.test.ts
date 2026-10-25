import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as billsRoute from "@/app/api/bills/route";
import * as estimateRoute from "@/app/api/bills/[id]/estimate/route";
import * as occItem from "@/app/api/bills/[id]/occurrences/[date]/route";
import type { BillEstimateDTO } from "@/contracts/api";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon: todayLocal reads the machine-local date. History window starts 2026-07-28.
const NOW = new Date(2026, 9, 24, 12, 0, 0);

const createBill = async (over: object = {}) =>
  (await call(billsRoute.POST, "POST", "/api/bills", {
    body: { name: "City Electric", amountCents: 9000, frequency: "MONTHLY", anchorDate: "2026-08-15", ...over },
  })).body as { id: string };
const estimate = (id: string, query = "") =>
  call<BillEstimateDTO>(estimateRoute.GET as never, "GET", `/api/bills/${id}/estimate${query}`, { params: { id } });

async function seedBank(txs: { id: string; date: string; amount: number; description: string; pending?: boolean }[]) {
  const connection = await testPrisma.bankConnection.create({ data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin" } });
  const accountId = `${connection.id}:a1`;
  await testPrisma.bankAccount.create({
    data: { id: accountId, connectionId: connection.id, providerAccountId: "a1", institutionName: "Demo Bank", name: "Checking", currency: "USD", balanceCents: 0, balanceDate: "2026-10-24" },
  });
  await testPrisma.bankTransaction.createMany({
    data: txs.map((t) => ({ id: `${accountId}:${t.id}`, accountId, date: t.date, amountCents: t.amount, description: t.description, pending: t.pending ?? false })),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/bills/:id/estimate", () => {
  it("says so when no bank is connected", async () => {
    const bill = await createBill();
    const res = await estimate(bill.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estimate: null, reason: "NO_BANK_DATA", currency: "USD" });
  });

  it("averages the matching payments in the stored history", async () => {
    const bill = await createBill();
    await seedBank([
      { id: "e1", date: "2026-08-12", amount: -8000, description: "CITY ELECTRIC 1111" },
      { id: "e2", date: "2026-09-12", amount: -10000, description: "CITY ELECTRIC 2222" },
      { id: "e3", date: "2026-09-13", amount: -99999, description: "CITY ELECTRIC pending", pending: true },
      { id: "e4", date: "2026-07-12", amount: -99999, description: "CITY ELECTRIC old" }, // outside the 89 days
      { id: "k1", date: "2026-09-12", amount: -5000, description: "KROGER" },
    ]);
    const res = await estimate(bill.id, "?date=2026-11-15");
    expect(res.body).toEqual({
      estimate: { amountCents: 9000, method: "ROLLING", periodCount: 2, firstDate: "2026-08-12", lastDate: "2026-09-12" },
      reason: null,
      currency: "USD",
    });
  });

  it("reports why there is no suggestion", async () => {
    const bill = await createBill();
    await seedBank([{ id: "k1", date: "2026-09-12", amount: -5000, description: "KROGER" }]);
    expect((await estimate(bill.id)).body).toMatchObject({ estimate: null, reason: "NO_MATCHES" });
    expect((await estimate((await createBill({ frequency: "YEARLY" })).id)).body).toMatchObject({ reason: "UNSUPPORTED_FREQUENCY" });
  });

  it("changes nothing: the bill and its occurrence rows stay as they were", async () => {
    const bill = await createBill();
    await call(occItem.PUT, "PUT", `/api/bills/${bill.id}/occurrences/2026-11-15`, {
      body: { status: "UPCOMING", amountOverrideCents: 12345 },
      params: { id: bill.id, date: "2026-11-15" },
    });
    await seedBank([
      { id: "e1", date: "2026-08-12", amount: -8000, description: "CITY ELECTRIC" },
      { id: "e2", date: "2026-09-12", amount: -10000, description: "CITY ELECTRIC" },
    ]);
    await estimate(bill.id, "?date=2026-11-15");
    expect(await testPrisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({ amountCents: 9000 });
    expect(await testPrisma.billOccurrence.findMany()).toMatchObject([{ dueDate: "2026-11-15", amountOverrideCents: 12345 }]);
  });

  it("404 for an unknown bill, 400 for a bad date", async () => {
    expectApiError(await estimate("nope"), 404, "NOT_FOUND");
    const bill = await createBill();
    expectApiError(await estimate(bill.id, "?date=tomorrow"), 400, "VALIDATION_ERROR");
  });
});
