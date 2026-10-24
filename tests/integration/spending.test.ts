import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as spendingRoute from "@/app/api/spending/route";
import type { SpendingResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon: todayLocal reads the machine-local date.
const NOW = new Date(2026, 9, 24, 12, 0, 0);

const spending = () => call<SpendingResponse>(spendingRoute.GET as never, "GET", "/api/spending");

async function seedBank(txs: { id: string; date: string; amount: number; description: string; pending?: boolean }[]) {
  const connection = await testPrisma.bankConnection.create({
    data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin", lastSyncedAt: new Date("2026-10-24T10:00:00Z") },
  });
  const accountId = `${connection.id}:a1`;
  await testPrisma.bankAccount.create({
    data: {
      id: accountId,
      connectionId: connection.id,
      providerAccountId: "a1",
      institutionName: "Demo Bank",
      name: "Checking",
      currency: "USD",
      balanceCents: 100000,
      balanceDate: "2026-10-24",
    },
  });
  await testPrisma.bankTransaction.createMany({
    data: txs.map((t) => ({
      id: `${accountId}:${t.id}`,
      accountId,
      date: t.date,
      amountCents: t.amount,
      description: t.description,
      pending: t.pending ?? false,
    })),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/spending", () => {
  it("reports no connections when no bank is linked", async () => {
    const res = await spending();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connectionCount: 0,
      transactionCount: 0,
      lastSyncedAt: null,
      currency: "USD",
      coverageStart: null,
      lastMonthToDateCents: 0,
      thisMonth: { from: "2026-10-01", to: "2026-10-24", totalCents: 0, categories: [], topMerchants: [] },
      lastMonth: { from: "2026-09-01", to: "2026-09-30", totalCents: 0, categories: [], topMerchants: [] },
    });
  });

  it("groups stored spending by category for this month and last month", async () => {
    await seedBank([
      { id: "g1", date: "2026-10-05", amount: -8000, description: "KROGER #1234" },
      { id: "g2", date: "2026-10-12", amount: -4000, description: "SHELL OIL 5544" },
      { id: "g3", date: "2026-09-10", amount: -6000, description: "KROGER #1234" },
      { id: "g4", date: "2026-09-28", amount: -2000, description: "KROGER #1234" },
      { id: "t1", date: "2026-10-03", amount: -50000, description: "CHASE CREDIT CARD PAYMENT" },
      { id: "i1", date: "2026-10-09", amount: 215000, description: "ACME PAYROLL" },
    ]);
    const { body } = await spending();
    expect(body.connectionCount).toBe(1);
    expect(body.transactionCount).toBe(6);
    expect(body.lastSyncedAt).toBe("2026-10-24T10:00:00.000Z");
    expect(body.coverageStart).toBe("2026-09-10");
    expect(body.thisMonth).toMatchObject({ totalCents: 12000, transactionCount: 2, transfersCents: 50000 });
    expect(body.thisMonth.categories).toEqual([
      { category: "GROCERIES", totalCents: 8000, transactionCount: 1 },
      { category: "GAS", totalCents: 4000, transactionCount: 1 },
    ]);
    expect(body.thisMonth.topMerchants.map((m) => [m.name, m.totalCents])).toEqual([
      ["Kroger", 8000],
      ["Shell Oil", 4000],
    ]);
    expect(body.lastMonth).toMatchObject({ totalCents: 8000, transactionCount: 2 });
    expect(body.lastMonthToDateCents).toBe(6000);
  });

  it("ignores pending transactions and rows older than the 89-day history window", async () => {
    await seedBank([
      { id: "a", date: "2026-10-03", amount: -1000, description: "KROGER" },
      { id: "b", date: "2026-10-04", amount: -1000, description: "KROGER", pending: true },
      { id: "c", date: "2026-07-03", amount: -1000, description: "KROGER" }, // before 2026-07-28
    ]);
    const { body } = await spending();
    expect(body.transactionCount).toBe(1);
    expect(body.thisMonth.totalCents).toBe(1000);
    expect(body.coverageStart).toBe("2026-10-03");
  });
});
