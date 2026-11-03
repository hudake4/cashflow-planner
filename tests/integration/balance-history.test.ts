import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/balance-history/route";
import { PUT } from "@/app/api/settings/route";
import type { BalanceHistoryResponse } from "@/contracts/api";
import { addDays, todayLocal } from "@/domain/dates";
import { call, expectApiError } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

const today = todayLocal();
const settings = (source: "MANUAL" | "ACCOUNTS") => ({
  startingBalanceCents: 100000,
  startingBalanceSource: source,
  projectionStartDate: today,
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
});

async function addAccount(
  id: string,
  balanceCents: number,
  { kind = "BANK", connectedDaysAgo = 0, transactions = [] as { date: string; amountCents: number; pending?: boolean }[] } = {},
) {
  const conn = await testPrisma.bankConnection.create({
    data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin", createdAt: new Date(Date.now() - connectedDaysAgo * 86_400_000) },
  });
  const accountId = `${conn.id}:${id}`;
  await testPrisma.bankAccount.create({
    data: { id: accountId, connectionId: conn.id, providerAccountId: id, institutionName: "Bank", name: id, kind, currency: "USD", balanceCents, balanceDate: today },
  });
  for (const [i, t] of transactions.entries()) {
    await testPrisma.bankTransaction.create({
      data: { id: `${accountId}:t${i}`, accountId, date: t.date, amountCents: t.amountCents, description: "x", pending: t.pending ?? false },
    });
  }
}

const history = async (query = "") => {
  const res = await call<BalanceHistoryResponse>(GET, "GET", `/api/balance-history${query}`);
  expect(res.status).toBe(200);
  return res.body;
};

describe("GET /api/balance-history", () => {
  it("rebuilds yesterday's balance from the accounts and their transactions", async () => {
    await addAccount("checking", 80000, {
      transactions: [
        { date: today, amountCents: -2000 },
        { date: addDays(today, -1), amountCents: 50000 },
        { date: addDays(today, -3), amountCents: -7000 },
      ],
    });
    await call(PUT, "PUT", "/api/settings", { body: settings("ACCOUNTS") });

    const body = await history(`?from=${addDays(today, -4)}&to=${addDays(today, -1)}`);
    expect(body.currency).toBe("USD");
    expect(body.range).toEqual({ from: addDays(today, -4), to: addDays(today, -1) });
    expect(body.days).toEqual([
      { date: addDays(today, -4), closingBalanceCents: 82000 + 7000 - 50000 },
      { date: addDays(today, -3), closingBalanceCents: 82000 - 50000 },
      { date: addDays(today, -2), closingBalanceCents: 82000 - 50000 },
      { date: addDays(today, -1), closingBalanceCents: 82000 },
    ]);
  });

  it("stops the day before the projection start even when asked for later days", async () => {
    await addAccount("checking", 80000);
    await call(PUT, "PUT", "/api/settings", { body: settings("ACCOUNTS") });
    const body = await history(`?from=${addDays(today, -2)}&to=${addDays(today, 5)}`);
    expect(body.range).toEqual({ from: addDays(today, -2), to: addDays(today, -1) });
  });

  it("leaves out pending transactions and accounts that are not BANK accounts", async () => {
    await addAccount("checking", 80000, { transactions: [{ date: today, amountCents: -3000, pending: true }] });
    await addAccount("card", -50000, { kind: "CREDIT", transactions: [{ date: today, amountCents: -9000 }] });
    await call(PUT, "PUT", "/api/settings", { body: settings("ACCOUNTS") });
    const body = await history(`?from=${addDays(today, -1)}&to=${addDays(today, -1)}`);
    expect(body.days).toEqual([{ date: addDays(today, -1), closingBalanceCents: 80000 }]);
  });

  it("only goes back as far as the first sync's window, and no further than the account has been connected", async () => {
    await addAccount("checking", 80000, { connectedDaysAgo: 10 });
    await call(PUT, "PUT", "/api/settings", { body: settings("ACCOUNTS") });
    const body = await history(`?from=${addDays(today, -300)}&to=${addDays(today, -1)}`);
    // ~90 days back from the day it was connected, 10 days ago (the window is on UTC dates, so allow a day either side of local).
    const first = body.days[0].date;
    expect(first >= addDays(today, -100) && first <= addDays(today, -96)).toBe(true);
    expect(body.coverageStart).toBe(first);
  });

  it("has no history when the starting balance is typed", async () => {
    await addAccount("checking", 80000);
    await call(PUT, "PUT", "/api/settings", { body: settings("MANUAL") });
    expect(await history(`?from=${addDays(today, -5)}&to=${addDays(today, -1)}`)).toEqual({
      currency: "USD",
      days: [],
      range: null,
      coverageStart: null,
    });
  });

  it("has no history when no bank account is connected", async () => {
    await call(PUT, "PUT", "/api/settings", { body: settings("ACCOUNTS") });
    expect((await history()).days).toEqual([]);
  });

  it("400 VALIDATION_ERROR for a bad date or a reversed range", async () => {
    expectApiError(await call(GET, "GET", "/api/balance-history?from=nope"), 400, "VALIDATION_ERROR", ["from"]);
    expectApiError(await call(GET, "GET", "/api/balance-history?from=2026-10-05&to=2026-10-01"), 400, "VALIDATION_ERROR", ["to"]);
  });
});
