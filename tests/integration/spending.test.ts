import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as spendingRoute from "@/app/api/spending/route";
import * as categoryRoute from "@/app/api/spending/transactions/[id]/category/route";
import type { SpendingResponse } from "@/contracts/api";
import { call, expectApiError } from "../helpers/api";
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

async function seedAccount(key: string, kind: string, txs: { id: string; date: string; amount: number; description: string }[]) {
  const connection = await testPrisma.bankConnection.findFirstOrThrow();
  const accountId = `${connection.id}:${key}`;
  await testPrisma.bankAccount.create({
    data: {
      id: accountId,
      connectionId: connection.id,
      providerAccountId: key,
      institutionName: "Demo Bank",
      name: key,
      kind,
      currency: "USD",
      balanceCents: 0,
      balanceDate: "2026-10-24",
    },
  });
  await testPrisma.bankTransaction.createMany({
    data: txs.map((t) => ({ id: `${accountId}:${t.id}`, accountId, date: t.date, amountCents: t.amount, description: t.description, pending: false })),
  });
}

describe("GET /api/spending and credit cards", () => {
  it("counts card purchases once: the bank-side card payment is a transfer, loans and other accounts are left out", async () => {
    await seedBank([
      { id: "pay", date: "2026-10-03", amount: -12000, description: "ACME BILLING 8841" },
      { id: "k", date: "2026-10-04", amount: -2500, description: "KROGER" },
    ]);
    await seedAccount("card", "CREDIT", [
      { id: "credit", date: "2026-10-04", amount: 12000, description: "AUTOMATIC PAYMENT" },
      { id: "shop", date: "2026-10-02", amount: -12000, description: "TARGET #55" },
    ]);
    await seedAccount("loan", "LOAN", [{ id: "interest", date: "2026-10-02", amount: -700, description: "INTEREST CHARGE" }]);
    await seedAccount("other", "OTHER", [{ id: "fee", date: "2026-10-02", amount: -300, description: "MAINTENANCE FEE" }]);

    const { body } = await spending();
    expect(body.transactionCount).toBe(4);
    expect(body.thisMonth).toMatchObject({ totalCents: 14500, transactionCount: 2, transfersCents: 12000 });
    expect(body.thisMonth.categories.map((c) => c.category).sort()).toEqual(["GROCERIES", "SHOPPING"]);
  });
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
      thisMonth: { from: "2026-10-01", to: "2026-10-24", totalCents: 0, categories: [], topMerchants: [], transactions: [] },
      lastMonth: { from: "2026-09-01", to: "2026-09-30", totalCents: 0, categories: [], topMerchants: [], transactions: [] },
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

describe("PUT /api/spending/transactions/:id/category", () => {
  let accountId = "";
  const put = (id: string, body: unknown) =>
    call<SpendingResponse>(categoryRoute.PUT as never, "PUT", `/api/spending/transactions/${id}/category`, { body, params: { id } });
  const txId = (id: string) => `${accountId}:${id}`;

  async function seed() {
    await seedBank([
      { id: "k1", date: "2026-10-05", amount: -8000, description: "KROGER #1234" },
      { id: "k2", date: "2026-09-10", amount: -6000, description: "KROGER #5678" },
      { id: "s1", date: "2026-10-12", amount: -4000, description: "SHELL OIL 5544" },
      { id: "in", date: "2026-10-09", amount: 215000, description: "ACME PAYROLL" },
    ]);
    accountId = (await testPrisma.bankAccount.findFirstOrThrow()).id;
  }

  it("recategorizes one transaction without touching the merchant's others", async () => {
    await seed();
    const res = await put(txId("k1"), { category: "DINING", applyToMerchant: false });
    expect(res.status).toBe(200);
    expect(res.body.thisMonth.categories.map((c) => c.category)).toEqual(["DINING", "GAS"]);
    expect(res.body.lastMonth.categories.map((c) => c.category)).toEqual(["GROCERIES"]);
    expect(await testPrisma.merchantCategoryRule.count()).toBe(0);
    // The next page view shows the same thing.
    expect((await spending()).body.thisMonth.transactions.find((t) => t.id === txId("k1"))).toMatchObject({ category: "DINING", source: "MANUAL" });
  });

  it("learns the merchant: other transactions change now and the choice outlives a sync", async () => {
    await seed();
    const res = await put(txId("k1"), { category: "HEALTH" });
    expect(res.body.thisMonth.categories.map((c) => c.category)).toEqual(["HEALTH", "GAS"]);
    expect(res.body.lastMonth.categories.map((c) => c.category)).toEqual(["HEALTH"]);
    expect(await testPrisma.merchantCategoryRule.findMany()).toMatchObject([{ merchantKey: "kroger", category: "HEALTH" }]);

    // A later sync brings a new Kroger purchase with a different reference number.
    await testPrisma.bankTransaction.create({
      data: { id: txId("k3"), accountId, date: "2026-10-20", amountCents: -1000, description: "POS DEBIT KROGER 9999", pending: false },
    });
    const next = await spending();
    expect(next.body.thisMonth.transactions.find((t) => t.id === txId("k3"))).toMatchObject({ category: "HEALTH", source: "MERCHANT" });
  });

  it("the latest choice wins and replaces older per-transaction choices for that merchant", async () => {
    await seed();
    await put(txId("k2"), { category: "BILLS", applyToMerchant: false });
    await put(txId("k1"), { category: "HEALTH" });
    const res = await put(txId("k1"), { category: "SHOPPING" });
    expect(await testPrisma.merchantCategoryRule.count()).toBe(1);
    expect(await testPrisma.transactionCategory.count()).toBe(0);
    expect(res.body.lastMonth.categories.map((c) => c.category)).toEqual(["SHOPPING"]);
    expect(res.body.thisMonth.categories.map((c) => c.category)).toEqual(["SHOPPING", "GAS"]);
  });

  it("a null category goes back to automatic, for the merchant or for one transaction", async () => {
    await seed();
    await put(txId("k1"), { category: "HEALTH" });
    const reset = await put(txId("k1"), { category: null });
    expect(await testPrisma.merchantCategoryRule.count()).toBe(0);
    expect(reset.body.thisMonth.categories.map((c) => c.category)).toEqual(["GROCERIES", "GAS"]);

    await put(txId("s1"), { category: "TRANSPORT", applyToMerchant: false });
    const single = await put(txId("s1"), { category: null, applyToMerchant: false });
    expect(await testPrisma.transactionCategory.count()).toBe(0);
    expect(single.body.thisMonth.categories.map((c) => c.category)).toEqual(["GROCERIES", "GAS"]);
  });

  it("can move a transfer into spending", async () => {
    await seedBank([{ id: "z", date: "2026-10-03", amount: -90000, description: "ZELLE TO LANDLORD" }]);
    const id = (await testPrisma.bankTransaction.findFirstOrThrow()).id;
    const before = await spending();
    expect(before.body.thisMonth).toMatchObject({ totalCents: 0, transfersCents: 90000 });
    const res = await put(id, { category: "BILLS" });
    expect(res.body.thisMonth).toMatchObject({ totalCents: 90000, transfersCents: 0 });
  });

  it("prunes choices for transactions that have left the history window", async () => {
    await seed();
    await testPrisma.transactionCategory.create({ data: { transactionId: "gone", category: "DINING", date: "2026-05-01" } });
    await put(txId("s1"), { category: "TRANSPORT", applyToMerchant: false });
    expect((await testPrisma.transactionCategory.findMany()).map((r) => r.transactionId)).toEqual([txId("s1")]);
  });

  it("ignores stored categories it doesn't recognise", async () => {
    await seed();
    await testPrisma.merchantCategoryRule.create({ data: { merchantKey: "kroger", category: "NOT_A_CATEGORY" } });
    const { body } = await spending();
    expect(body.thisMonth.categories.map((c) => c.category)).toEqual(["GROCERIES", "GAS"]);
  });

  it("rejects unknown transactions, money in, pending rows, and bad bodies", async () => {
    await seed();
    expectApiError(await put("nope", { category: "DINING" }), 404, "NOT_FOUND");
    expectApiError(await put(txId("in"), { category: "DINING" }), 400, "BAD_REQUEST");
    expectApiError(await put(txId("k1"), { category: "NOT_A_CATEGORY" }), 400, "VALIDATION_ERROR", ["category"]);
    expectApiError(await put(txId("k1"), { applyToMerchant: true }), 400, "VALIDATION_ERROR", ["category"]);
    expectApiError(await put(txId("k1"), { category: "DINING", extra: 1 }), 400, "VALIDATION_ERROR");

    await testPrisma.bankTransaction.create({
      data: { id: txId("p"), accountId, date: "2026-10-10", amountCents: -100, description: "PENDING SHOP", pending: true },
    });
    expectApiError(await put(txId("p"), { category: "DINING" }), 404, "NOT_FOUND");
  });

  it("refuses a merchant rule for a description with no merchant name, but allows one transaction", async () => {
    await seedBank([{ id: "n", date: "2026-10-03", amount: -500, description: "12345 6789" }]);
    const id = (await testPrisma.bankTransaction.findFirstOrThrow()).id;
    expectApiError(await put(id, { category: "DINING" }), 400, "BAD_REQUEST");
    const ok = await put(id, { category: "DINING", applyToMerchant: false });
    expect(ok.status).toBe(200);
    expect(ok.body.thisMonth.transactions[0]).toMatchObject({ category: "DINING", source: "MANUAL", merchantLearnable: false });
  });
});
