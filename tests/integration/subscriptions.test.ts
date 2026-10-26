import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dismissRoute from "@/app/api/subscriptions/dismiss/route";
import * as subscriptionsRoute from "@/app/api/subscriptions/route";
import type { SubscriptionAuditResponse } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

const NOW = new Date(2026, 9, 24, 12, 0, 0);

const audit = () => call<SubscriptionAuditResponse>(subscriptionsRoute.GET as never, "GET", "/api/subscriptions");
const dismiss = (key: string) =>
  call(dismissRoute.POST as never, "POST", "/api/subscriptions/dismiss", { body: { key } });

async function seedBank(txs: { id: string; date: string; amount: number; description: string }[]) {
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
    data: txs.map((t) => ({ id: `${accountId}:${t.id}`, accountId, date: t.date, amountCents: t.amount, description: t.description, pending: false })),
  });
}

async function seedBill(over: Partial<{ name: string; amountCents: number; frequency: string; active: boolean }> = {}) {
  return testPrisma.bill.create({
    data: { name: "Rent", amountCents: 120000, frequency: "MONTHLY", anchorDate: "2026-01-02", active: true, ...over },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/subscriptions", () => {
  it("returns detected charges (bills only) plus the tracked bills", async () => {
    await seedBank([
      { id: "n1", date: "2026-09-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "n2", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 9876" },
      { id: "p1", date: "2026-09-25", amount: 215000, description: "ACME PAYROLL" },
      { id: "p2", date: "2026-10-09", amount: 215000, description: "ACME PAYROLL" },
      { id: "p3", date: "2026-10-23", amount: 215000, description: "ACME PAYROLL" },
    ]);
    await seedBill();

    const { body } = await audit();
    expect(body.suggestions.map((s) => [s.kind, s.name])).toEqual([["BILL", "Netflix.com"]]);
    expect(body.tracked.map((b) => b.name)).toEqual(["Rent"]);
    expect(body.currency).toBe("USD");
  });

  it("shows an already-tracked subscription as tracked while suppressing the duplicate suggestion", async () => {
    await seedBank([
      { id: "n1", date: "2026-09-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "n2", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 9876" },
    ]);
    await seedBill({ name: "Netflix", amountCents: 1549 });

    const { body } = await audit();
    expect(body.suggestions).toEqual([]);
    expect(body.tracked.map((b) => b.name)).toEqual(["Netflix"]);
  });
});

describe("POST /api/subscriptions/dismiss", () => {
  it("removes a dismissed charge from later audits", async () => {
    await seedBank([
      { id: "n1", date: "2026-09-03", amount: -1549, description: "NETFLIX.COM 1234" },
      { id: "n2", date: "2026-10-03", amount: -1549, description: "NETFLIX.COM 9876" },
    ]);

    expect((await audit()).body.suggestions.map((s) => s.key)).toEqual(["BILL:netflix com"]);

    const res = await dismiss("BILL:netflix com");
    expect(res.status).toBe(204);

    expect((await audit()).body.suggestions).toEqual([]);
  });

  it("rejects a body without a key", async () => {
    const res = await call(dismissRoute.POST as never, "POST", "/api/subscriptions/dismiss", { body: {} });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });
});
