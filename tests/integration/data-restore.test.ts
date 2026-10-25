import { describe, expect, it } from "vitest";
import * as exportRoute from "@/app/api/data/export/route";
import * as restoreRoute from "@/app/api/data/restore/route";
import type { DataExportDTO } from "@/contracts/api";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

async function exported(): Promise<DataExportDTO> {
  const response = await exportRoute.GET();
  return JSON.parse(await response.text()) as DataExportDTO;
}

async function snapshot() {
  return {
    settings: await testPrisma.settings.findMany(),
    incomes: await testPrisma.incomeSource.findMany(),
    bills: await testPrisma.bill.findMany(),
    occurrences: await testPrisma.billOccurrence.findMany(),
    connections: await testPrisma.bankConnection.findMany(),
    accounts: await testPrisma.bankAccount.findMany(),
    transactions: await testPrisma.bankTransaction.findMany(),
    transactionCategories: await testPrisma.transactionCategory.findMany(),
    merchantRules: await testPrisma.merchantCategoryRule.findMany(),
  };
}

describe("POST /api/data/restore", () => {
  it("round-trips stored settings, income, bills and occurrences", async () => {
    await testPrisma.settings.create({ data: { householdId: "local", startingBalanceCents: -23000, startingBalanceSource: "MANUAL", projectionStartDate: "2026-10-20", currency: "CAD", forecastDays: 120, weekStartsOn: 1, defaultCalendarView: "week" } });
    await testPrisma.incomeSource.create({ data: { id: "income-roundtrip", householdId: "local", name: "Paycheck", amountCents: 100000, frequency: "BIWEEKLY", anchorDate: "2026-10-30", createdAt: new Date("2026-01-01T00:00:00Z") } });
    await testPrisma.bill.create({ data: { id: "bill-roundtrip", householdId: "local", name: "Rent", amountCents: 90000, frequency: "MONTHLY", anchorDate: "2026-10-01", createdAt: new Date("2026-02-01T00:00:00Z") } });
    await testPrisma.billOccurrence.create({ data: { billId: "bill-roundtrip", dueDate: "2026-10-01", status: "PAID", amountOverrideCents: 88000, note: "sent", updatedAt: new Date("2026-10-02T00:00:00Z") } });
    const original = await exported();

    await testPrisma.billOccurrence.deleteMany();
    await testPrisma.bill.deleteMany();
    await testPrisma.incomeSource.deleteMany();
    await testPrisma.settings.update({ where: { householdId: "local" }, data: { startingBalanceCents: 0, currency: "USD" } });

    expect(await call(restoreRoute.POST, "POST", "/api/data/restore", { body: original })).toMatchObject({ status: 200, body: { ok: true } });
    const restored = await exported();
    expect(restored.settings).toMatchObject({ startingBalanceCents: -23000, startingBalanceSource: "MANUAL", projectionStartDate: "2026-10-20", currency: "CAD", forecastDays: 120, weekStartsOn: 1, defaultCalendarView: "week" });
    expect(restored.incomes).toEqual(original.incomes);
    expect(restored.bills).toEqual(original.bills);
    expect(restored.billOccurrences).toEqual(original.billOccurrences);
  });

  it("rejects malformed, unsupported, invalid, orphaned, and duplicate data without changing the database", async () => {
    await testPrisma.incomeSource.create({ data: { id: "existing", householdId: "local", name: "Existing", amountCents: 100, frequency: "WEEKLY", anchorDate: "2026-10-25" } });
    const valid = await exported();
    const before = await snapshot();
    const badSchema = { ...valid, settings: { ...valid.settings, currency: "not money" } };
    const orphan = { ...valid, billOccurrences: [{ billId: "missing", dueDate: "2026-10-25", status: "PAID", amountOverrideCents: null, note: null, updatedAt: "2026-10-25T00:00:00.000Z" }] };
    const duplicateIncome = { ...valid, incomes: [valid.incomes[0], valid.incomes[0]] };
    const sampleBill = { id: "dupe-bill", name: "Bill", amountCents: 100, frequency: "ONE_TIME", anchorDate: "2026-10-25", endDate: null, category: null, notes: null, active: true, createdAt: valid.exportedAt, updatedAt: valid.exportedAt };
    const duplicateBills = { ...valid, bills: [sampleBill, sampleBill] };
    const occurrence = { billId: "dupe-bill", dueDate: "2026-10-25", status: "PAID", amountOverrideCents: null, note: null, updatedAt: valid.exportedAt };
    const duplicateOccurrences = { ...valid, bills: [sampleBill], billOccurrences: [occurrence, occurrence] };
    const cases: [string, unknown, string][] = [
      ["malformed JSON", "{", "BAD_REQUEST"],
      ["wrong format", { ...valid, format: "other" }, "VALIDATION_ERROR"],
      ["unsupported version", { ...valid, formatVersion: 2 }, "VALIDATION_ERROR"],
      ["schema failure", badSchema, "VALIDATION_ERROR"],
      ["orphan occurrence", orphan, "BAD_REQUEST"],
      ["duplicate income id", duplicateIncome, "BAD_REQUEST"],
      ["duplicate bill id", duplicateBills, "BAD_REQUEST"],
      ["duplicate occurrence", duplicateOccurrences, "BAD_REQUEST"],
    ];
    for (const [label, body, code] of cases) {
      const result = await call(restoreRoute.POST, "POST", "/api/data/restore", { body });
      expect(result.status, label).toBe(400);
      expect((result.body as { error: { code: string } }).error.code, label).toBe(code);
      expect(await snapshot(), label).toEqual(before);
    }
  });

  it("keeps current banks, transactions, and category choices even when institutions differ", async () => {
    await testPrisma.bankConnection.create({ data: { id: "conn-keep", householdId: "local", accessUrl: "https://example.invalid/secret", accounts: { create: { id: "account-keep", providerAccountId: "provider", institutionName: "Bank now", name: "Checking", kind: "BANK", currency: "USD", balanceCents: 10, balanceDate: "2026-10-25", transactions: { create: { id: "transaction-keep", date: "2026-10-24", amountCents: -2, description: "Coffee", pending: false } } } } } });
    await testPrisma.transactionCategory.create({ data: { transactionId: "transaction-keep", householdId: "local", category: "DINING", date: "2026-10-24" } });
    await testPrisma.merchantCategoryRule.create({ data: { householdId: "local", merchantKey: "COFFEE SHOP", category: "DINING" } });
    const backup = await exported();
    const originalInstitution = backup.institutions[0];
    backup.institutions = [{ ...originalInstitution, id: "different", name: "Other bank", accounts: [], transactions: [] }];
    await testPrisma.bankConnection.update({ where: { id: "conn-keep" }, data: { lastSyncedAt: new Date("2026-10-25T00:00:00Z") } });
    const before = await snapshot();

    expect(await call(restoreRoute.POST, "POST", "/api/data/restore", { body: backup })).toMatchObject({ status: 200, body: { ok: true } });
    const after = await snapshot();
    expect(after.connections).toEqual(before.connections);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.transactionCategories).toEqual(before.transactionCategories);
    expect(after.merchantRules).toEqual(before.merchantRules);
  });
});
