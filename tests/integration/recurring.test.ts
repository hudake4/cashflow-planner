import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as incomeRoute from "@/app/api/income/route";
import * as recurringRoute from "@/app/api/recurring/route";
import type { RecurringScanResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon: todayLocal reads the machine-local date.
const NOW = new Date(2026, 9, 24, 12, 0, 0);

const scan = () => call<RecurringScanResponse>(recurringRoute.GET as never, "GET", "/api/recurring");

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

describe("GET /api/recurring", () => {
  it("reports no connections when no bank is linked", async () => {
    const res = await scan();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ suggestions: [], connectionCount: 0, transactionCount: 0, lastSyncedAt: null, currency: "USD" });
  });

  it("finds repeating payments and deposits in the stored history", async () => {
    await seedBank([
      { id: "n1", date: "2026-09-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "n2", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 9876" },
      { id: "p1", date: "2026-10-09", amount: 215000, description: "ACME PAYROLL" },
      { id: "p2", date: "2026-09-25", amount: 215000, description: "ACME PAYROLL" },
      { id: "p3", date: "2026-10-23", amount: 215000, description: "ACME PAYROLL" },
      { id: "x1", date: "2026-10-12", amount: -4200, description: "One-off hardware store" },
    ]);
    const { body } = await scan();
    expect(body.connectionCount).toBe(1);
    expect(body.transactionCount).toBe(6);
    expect(body.lastSyncedAt).toBe("2026-10-24T10:00:00.000Z");
    expect(body.suggestions.map((s) => [s.kind, s.name, s.frequency, s.nextDate])).toEqual([
      ["BILL", "Netflix.com", "MONTHLY", "2026-11-03"],
      ["INCOME", "Acme Payroll", "BIWEEKLY", "2026-11-06"],
    ]);
  });

  it("ignores pending transactions and rows older than the 89-day history window", async () => {
    await seedBank([
      { id: "a", date: "2026-10-03", amount: -1000, description: "Gym" },
      { id: "b", date: "2026-09-03", amount: -1000, description: "Gym", pending: true },
      { id: "c", date: "2026-07-03", amount: -1000, description: "Gym" }, // before 2026-07-28
    ]);
    const { body } = await scan();
    expect(body.transactionCount).toBe(1);
    expect(body.suggestions).toEqual([]);
  });

  it("only reads bank accounts: a card's purchases and the payments it receives are not suggested", async () => {
    await seedBank([
      { id: "n1", date: "2026-09-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "n2", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 9876" },
    ]);
    const connection = await testPrisma.bankConnection.findFirstOrThrow();
    const cardId = `${connection.id}:card`;
    await testPrisma.bankAccount.create({
      data: {
        id: cardId,
        connectionId: connection.id,
        providerAccountId: "card",
        institutionName: "Demo Bank",
        name: "Rewards Card",
        kind: "CREDIT",
        currency: "USD",
        balanceCents: -50000,
        balanceDate: "2026-10-24",
      },
    });
    await testPrisma.bankTransaction.createMany({
      data: [
        { id: "c1", date: "2026-09-04", amountCents: -999, description: "SPOTIFY USA" },
        { id: "c2", date: "2026-10-04", amountCents: -999, description: "SPOTIFY USA" },
        { id: "p1", date: "2026-09-12", amountCents: 80000, description: "PAYMENT THANK YOU" },
        { id: "p2", date: "2026-10-12", amountCents: 80000, description: "PAYMENT THANK YOU" },
      ].map((t) => ({ ...t, id: `${cardId}:${t.id}`, accountId: cardId, pending: false })),
    });
    const { body } = await scan();
    expect(body.transactionCount).toBe(2);
    expect(body.suggestions.map((s) => s.name)).toEqual(["Netflix.com"]);
  });

  it("stops suggesting something once it has been added, and the new income accepts a monthly frequency", async () => {
    await seedBank([
      { id: "r1", date: "2026-09-01", amount: 90000, description: "TENANT RENT" },
      { id: "r2", date: "2026-10-01", amount: 90000, description: "TENANT RENT" },
    ]);
    const [first] = (await scan()).body.suggestions;
    expect(first).toMatchObject({ kind: "INCOME", frequency: "MONTHLY", nextDate: "2026-11-01" });

    const created = await call(incomeRoute.POST as never, "POST", "/api/income", {
      body: { name: first.name, amountCents: first.amountCents, frequency: first.frequency, anchorDate: first.nextDate },
    });
    expect(created.status).toBe(201);
    expect((await scan()).body.suggestions).toEqual([]);
  });
});
