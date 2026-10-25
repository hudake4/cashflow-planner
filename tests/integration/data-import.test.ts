import { beforeEach, describe, expect, it, vi } from "vitest";
import * as importRoute from "@/app/api/data/import/route";
import * as exportRoute from "@/app/api/data/export/route";
import * as settingsRoute from "@/app/api/settings/route";
import * as incomeRoute from "@/app/api/income/route";
import * as billsRoute from "@/app/api/bills/route";
import * as occurrenceRoute from "@/app/api/bills/[id]/occurrences/[date]/route";
import type { DataExportDTO } from "@/contracts/api";
import { connect } from "@/server/repositories/institutions";
import * as simplefin from "@/server/simplefin";
import { normalizeAccountSet } from "@/server/simplefin-mapping";
import { call } from "../helpers/api";
import { testPrisma } from "../setup/integration-setup";

vi.mock("@/server/simplefin", () => ({ claimSetupToken: vi.fn(), fetchAccountSet: vi.fn() }));
const mockedSimplefin = vi.mocked(simplefin);
const NOW = new Date("2026-10-24T15:00:00Z");
const ep = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;
const ACCOUNT_SET = normalizeAccountSet({
  errlist: [], connections: [{ conn_id: "c1", name: "Import Test Bank", org_id: "o", sfin_url: "https://x" }],
  accounts: [{ id: "a1", name: "Checking", conn_id: "c1", currency: "USD", balance: "123.45", "balance-date": ep("2026-10-24"), transactions: [{ id: "t1", posted: ep("2026-10-20"), amount: "-2.00", description: "Coffee" }] }],
}, "2026-10-24");

async function exportBackup(): Promise<{ response: Response; body: DataExportDTO }> {
  const response = await exportRoute.GET();
  return { response, body: JSON.parse(await response.text()) as DataExportDTO };
}
async function postImport(value: unknown) {
  return importRoute.POST(new Request("http://localhost/api/data/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }));
}
async function state() {
  const [incomes, bills, occurrences, settings] = await Promise.all([
    testPrisma.incomeSource.findMany({ orderBy: { id: "asc" } }),
    testPrisma.bill.findMany({ orderBy: { id: "asc" } }),
    testPrisma.billOccurrence.findMany({ orderBy: [{ billId: "asc" }, { dueDate: "asc" }] }),
    testPrisma.settings.findMany(),
  ]);
  return { incomes, bills, occurrences, settings };
}
async function populatedBackup(): Promise<DataExportDTO> {
  await call(settingsRoute.PUT, "PUT", "/api/settings", { body: { startingBalanceCents: 8888, startingBalanceSource: "MANUAL", projectionStartDate: "2026-10-01", currency: "CAD", forecastDays: 60, weekStartsOn: 1, defaultCalendarView: "week" } });
  await call(incomeRoute.POST, "POST", "/api/income", { body: { name: "Pay", amountCents: 200000, frequency: "BIWEEKLY", anchorDate: "2026-10-02" } });
  const bill = (await call<{ id: string }>(billsRoute.POST, "POST", "/api/bills", { body: { name: "Rent", amountCents: 120000, frequency: "MONTHLY", anchorDate: "2026-10-01", category: "Housing" } })).body;
  await occurrenceRoute.PUT(new Request("http://localhost", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "PAID", amountOverrideCents: 119000, note: "paid" }) }), { params: Promise.resolve({ id: bill.id, date: "2026-10-01" }) });
  return (await exportBackup()).body;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockedSimplefin.claimSetupToken.mockResolvedValue("https://user:password@bridge.simplefin.org/simplefin");
  mockedSimplefin.fetchAccountSet.mockResolvedValue(ACCOUNT_SET);
});

describe("POST /api/data/import", () => {
  it("round trips incomes, bills, occurrences and stored settings while replacing later changes", async () => {
    const first = await populatedBackup();
    await call(incomeRoute.POST, "POST", "/api/income", { body: { name: "Extra", amountCents: 10000, frequency: "WEEKLY", anchorDate: "2026-10-03" } });
    await call(settingsRoute.PUT, "PUT", "/api/settings", { body: { startingBalanceCents: 1, projectionStartDate: "2026-10-05", currency: "USD", forecastDays: 120, weekStartsOn: 0, defaultCalendarView: "month" } });
    const res = await postImport(first);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, restored: { incomes: 1, bills: 1, billOccurrences: 1 }, ignored: { institutions: 0, accounts: 0, transactions: 0 } });
    const after = (await exportBackup()).body;
    expect(after.incomes).toEqual(first.incomes);
    expect(after.bills).toEqual(first.bills);
    expect(after.billOccurrences).toEqual(first.billOccurrences);
    expect(after.settings).toMatchObject({ startingBalanceCents: 8888, startingBalanceSource: "MANUAL", projectionStartDate: "2026-10-01", currency: "CAD", forecastDays: 60, weekStartsOn: 1, defaultCalendarView: "week" });
  });

  it("preserves all existing banking and category rows and reports ignored backup institutions", async () => {
    const backup = await populatedBackup();
    const connection = await connect({ setupToken: "SETUP_TOKEN_UNUSED_VALUE" }, NOW);
    const accountCount = await testPrisma.bankAccount.count();
    const transactionCount = await testPrisma.bankTransaction.count();
    await testPrisma.transactionCategory.create({ data: { transactionId: `${connection.accounts[0].id}:t1`, date: "2026-10-20", category: "DINING", updatedAt: NOW } });
    await testPrisma.merchantCategoryRule.create({ data: { householdId: "local", merchantKey: "COFFEE", category: "DINING", updatedAt: NOW } });
    backup.institutions = [{ id: "ignored", name: "ignored", connectedAt: NOW.toISOString(), lastSyncedAt: null, accounts: [{ id: "ignored-account", name: "i", institutionName: "i", kind: "BANK", currency: "USD", balanceCents: 0, availableBalanceCents: null, balanceDate: "2026-10-24" }], transactions: [{ id: "ignored-transaction", accountId: "ignored-account", date: "2026-10-20", description: "ignored", amountCents: -100, pending: false }] }];
    const res = await postImport(backup);
    const body = await res.json();
    expect(body.ignored).toEqual({ institutions: 1, accounts: 1, transactions: 1 });
    expect(body.note).toContain("Bank connections are not restored");
    expect(await testPrisma.bankConnection.count()).toBe(1);
    expect(await testPrisma.bankAccount.count()).toBe(accountCount);
    expect(await testPrisma.bankTransaction.count()).toBe(transactionCount);
    expect(await testPrisma.transactionCategory.count()).toBe(1);
    expect(await testPrisma.merchantCategoryRule.count()).toBe(1);
  });

  it("returns VALIDATION_ERROR for invalid format or fields without changing data", async () => {
    await populatedBackup();
    const before = await state();
    const backup = (await exportBackup()).body;
    const wrongFormat = await postImport({ ...backup, formatVersion: 99 });
    expect(wrongFormat.status).toBe(400);
    expect((await wrongFormat.json()).error.code).toBe("VALIDATION_ERROR");
    const badField = await postImport({ ...backup, incomes: [{ ...backup.incomes[0], amountCents: -1 }] });
    expect(badField.status).toBe(400);
    expect((await badField.json()).error.code).toBe("VALIDATION_ERROR");
    expect(await state()).toEqual(before);
  });

  it("returns BAD_REQUEST for malformed JSON without changing data", async () => {
    await populatedBackup();
    const before = await state();
    const res = await importRoute.POST(new Request("http://localhost/api/data/import", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
    expect(await state()).toEqual(before);
  });

  it("rejects duplicate IDs and invalid occurrence references before changing data", async () => {
    await populatedBackup();
    const before = await state();
    const backup = (await exportBackup()).body;
    const cases: DataExportDTO[] = [
      { ...backup, incomes: [...backup.incomes, backup.incomes[0]] },
      { ...backup, bills: [...backup.bills, backup.bills[0]] },
      { ...backup, billOccurrences: [{ ...backup.billOccurrences[0], billId: "missing" }] },
      { ...backup, billOccurrences: [...backup.billOccurrences, backup.billOccurrences[0]] },
    ];
    for (const invalid of cases) {
      const res = await postImport(invalid);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
      expect(await state()).toEqual(before);
    }
  });

  it("rejects an income whose end date is before its anchor date without changing data", async () => {
    await populatedBackup();
    const before = await state();
    const backup = (await exportBackup()).body;
    backup.incomes[0] = { ...backup.incomes[0], anchorDate: "2026-10-10", endDate: "2026-10-01" };

    const res = await postImport(backup);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "BAD_REQUEST", message: expect.stringContaining(`income ${backup.incomes[0].id}`) } });
    expect(await state()).toEqual(before);
  });

  it("rejects a bill whose end date is before its anchor date without changing data", async () => {
    await populatedBackup();
    const before = await state();
    const backup = (await exportBackup()).body;
    backup.bills[0] = { ...backup.bills[0], anchorDate: "2026-10-10", endDate: "2026-10-01" };

    const res = await postImport(backup);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "BAD_REQUEST", message: expect.stringContaining(`bill ${backup.bills[0].id}`) } });
    expect(await state()).toEqual(before);
  });
});
