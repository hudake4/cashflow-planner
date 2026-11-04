import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reviewRoute from "@/app/api/review/route";
import type { ReviewResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

// Local noon on a Tuesday: todayLocal reads the machine-local date.
const NOW = new Date(2026, 10, 3, 12, 0, 0);

const review = () => call<ReviewResponse>(reviewRoute.GET as never, "GET", "/api/review");

type Tx = { id: string; date: string; amount: number; description: string; pending?: boolean };

async function seedAccount(key: string, kind: string, txs: Tx[]) {
  const connection =
    (await testPrisma.bankConnection.findFirst()) ??
    (await testPrisma.bankConnection.create({
      data: { accessUrl: "https://u:p@bridge.simplefin.org/simplefin", lastSyncedAt: new Date("2026-11-03T10:00:00Z") },
    }));
  const accountId = `${connection.id}:${key}`;
  await testPrisma.bankAccount.create({
    data: { id: accountId, connectionId: connection.id, providerAccountId: key, institutionName: "Demo Bank", name: key, kind, currency: "USD", balanceCents: 0, balanceDate: "2026-11-03" },
  });
  await testPrisma.bankTransaction.createMany({
    data: txs.map((t) => ({ id: `${accountId}:${t.id}`, accountId, date: t.date, amountCents: t.amount, description: t.description, pending: t.pending ?? false })),
  });
}

async function seedBill(name: string, amountCents: number, occurrences: { dueDate: string; status: string; amountOverrideCents?: number }[]) {
  await testPrisma.bill.create({
    data: { name, amountCents, frequency: "MONTHLY", anchorDate: "2026-09-01", occurrences: { create: occurrences } },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/review", () => {
  it("reports no bank connection and zero figures on an empty database", async () => {
    const { status, body } = await review();
    expect(status).toBe(200);
    expect(body).toMatchObject({ connectionCount: 0, transactionCount: 0, coverageStart: null, currency: "USD", lastSyncedAt: null });
    expect(body.month.current).toMatchObject({ from: "2026-11-01", to: "2026-11-03", incomeCents: 0, spendingCents: 0, billsCents: 0 });
    expect(body.week.current).toMatchObject({ from: "2026-11-01", to: "2026-11-03" });
  });

  it("combines deposits, spending and paid bills for the week and the month", async () => {
    await seedAccount("checking", "BANK", [
      { id: "pay", date: "2026-11-02", amount: 250000, description: "ACME PAYROLL" },
      { id: "pay0", date: "2026-10-30", amount: 240000, description: "ACME PAYROLL" },
      { id: "k", date: "2026-11-03", amount: -4500, description: "KROGER #12" },
      { id: "k0", date: "2026-10-28", amount: -6000, description: "KROGER #12" },
      { id: "rent", date: "2026-11-01", amount: -90000, description: "LANDMARK APARTMENTS RENT" },
      { id: "refund", date: "2026-11-03", amount: 2000, description: "AMAZON REFUND" },
      { id: "pend", date: "2026-11-03", amount: 99900, description: "PENDING DEPOSIT", pending: true },
    ]);
    await seedAccount("card", "CREDIT", [{ id: "shop", date: "2026-11-02", amount: -1000, description: "TARGET #55" }]);
    await seedAccount("loan", "LOAN", [{ id: "pay", date: "2026-11-02", amount: 50000, description: "LOAN CREDIT" }]);
    await seedBill("Rent", 90000, [
      { dueDate: "2026-11-01", status: "PAID" },
      { dueDate: "2026-10-01", status: "PAID", amountOverrideCents: 88000 },
      { dueDate: "2026-12-01", status: "PAID" },
    ]);
    await seedBill("Gym", 3000, [{ dueDate: "2026-11-02", status: "SKIPPED" }]);

    const { body } = await review();

    expect(body).toMatchObject({ connectionCount: 1, transactionCount: 7, coverageStart: "2026-10-28" });
    expect(body.month.current).toMatchObject({
      incomeCents: 250000,
      spendingCents: 95500,
      netCents: 154500,
      billsCents: 90000,
      billsCount: 1,
    });
    expect(body.month.previous).toMatchObject({ incomeCents: 240000, spendingCents: 6000, billsCents: 88000, billsCount: 1 });
    expect(body.week.current).toMatchObject({ from: "2026-11-01", incomeCents: 250000, billsCents: 90000 });
    expect(body.week.previous).toMatchObject({ from: "2026-10-25", to: "2026-10-31", incomeCents: 240000, spendingCents: 6000, billsCents: 0 });
    expect(body.month.categories.map((c) => c.category)).toEqual(["BILLS", "GROCERIES", "SHOPPING"]);
  });

  it("starts the week on the day set in Settings", async () => {
    await testPrisma.settings.upsert({
      where: { householdId: "local" },
      create: { householdId: "local", projectionStartDate: "2026-11-01", weekStartsOn: 1 },
      update: { weekStartsOn: 1 },
    });
    const { body } = await review();
    expect(body.week.current.from).toBe("2026-11-02");
    expect(body.week.previous).toMatchObject({ from: "2026-10-26", to: "2026-11-01" });
  });
});
