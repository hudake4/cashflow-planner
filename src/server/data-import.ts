import type { PrismaClient } from "@prisma/client";
import type { DataExportDTO, DataImportResponse } from "@/contracts/api";
import { badRequest } from "@/server/http";
import { HOUSEHOLD_ID } from "@/server/defaults";

const BANKS_KEPT_NOTE = "Bank connections are not restored from a backup; connected banks were left as they are.";

/** Replaces only planner-owned data. Institution rows and user transaction labels are preserved. */
export async function restoreDataImport(prisma: PrismaClient, backup: DataExportDTO): Promise<DataImportResponse> {
  const incomeIds = new Set<string>();
  for (const income of backup.incomes) {
    if (income.endDate !== null && income.endDate < income.anchorDate) {
      throw badRequest(`Backup income ${income.id} end date must be on or after the first payday.`);
    }
    if (incomeIds.has(income.id)) throw badRequest(`Backup contains duplicate income id: ${income.id}.`);
    incomeIds.add(income.id);
  }
  const billIds = new Set<string>();
  for (const bill of backup.bills) {
    if (bill.endDate !== null && bill.endDate < bill.anchorDate) {
      throw badRequest(`Backup bill ${bill.id} end date must be on or after the first due date.`);
    }
    if (billIds.has(bill.id)) throw badRequest(`Backup contains duplicate bill id: ${bill.id}.`);
    billIds.add(bill.id);
  }
  const occurrenceKeys = new Set<string>();
  for (const occurrence of backup.billOccurrences) {
    if (!billIds.has(occurrence.billId)) throw badRequest(`Backup occurrence refers to missing bill: ${occurrence.billId}.`);
    const key = `${occurrence.billId}\u0000${occurrence.dueDate}`;
    if (occurrenceKeys.has(key)) throw badRequest(`Backup contains duplicate occurrence for ${occurrence.billId} on ${occurrence.dueDate}.`);
    occurrenceKeys.add(key);
  }

  await prisma.$transaction(async (tx) => {
    await tx.billOccurrence.deleteMany({ where: { bill: { householdId: HOUSEHOLD_ID } } });
    await tx.bill.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.createMany({
      data: backup.incomes.map((income) => ({
        id: income.id,
        householdId: HOUSEHOLD_ID,
        name: income.name,
        amountCents: income.amountCents,
        frequency: income.frequency,
        anchorDate: income.anchorDate,
        endDate: income.endDate,
        active: income.active,
        notes: income.notes,
        createdAt: new Date(income.createdAt),
        updatedAt: new Date(income.updatedAt),
      })),
    });
    await tx.bill.createMany({
      data: backup.bills.map((bill) => ({
        id: bill.id,
        householdId: HOUSEHOLD_ID,
        name: bill.name,
        amountCents: bill.amountCents,
        frequency: bill.frequency,
        anchorDate: bill.anchorDate,
        endDate: bill.endDate,
        category: bill.category,
        notes: bill.notes,
        active: bill.active,
        createdAt: new Date(bill.createdAt),
        updatedAt: new Date(bill.updatedAt),
      })),
    });
    await tx.billOccurrence.createMany({
      data: backup.billOccurrences.map((occurrence) => ({
        billId: occurrence.billId,
        dueDate: occurrence.dueDate,
        status: occurrence.status,
        amountOverrideCents: occurrence.amountOverrideCents,
        note: occurrence.note,
        updatedAt: new Date(occurrence.updatedAt),
      })),
    });

    const { settings } = backup;
    await tx.settings.upsert({
      where: { householdId: HOUSEHOLD_ID },
      create: {
        householdId: HOUSEHOLD_ID,
        startingBalanceCents: settings.startingBalanceCents,
        startingBalanceSource: settings.startingBalanceSource,
        projectionStartDate: settings.projectionStartDate,
        currency: settings.currency,
        forecastDays: settings.forecastDays,
        weekStartsOn: settings.weekStartsOn,
        defaultCalendarView: settings.defaultCalendarView,
      },
      update: {
        startingBalanceCents: settings.startingBalanceCents,
        startingBalanceSource: settings.startingBalanceSource,
        projectionStartDate: settings.projectionStartDate,
        currency: settings.currency,
        forecastDays: settings.forecastDays,
        weekStartsOn: settings.weekStartsOn,
        defaultCalendarView: settings.defaultCalendarView,
      },
    });
  });

  return {
    ok: true,
    restored: { incomes: backup.incomes.length, bills: backup.bills.length, billOccurrences: backup.billOccurrences.length },
    ignored: {
      institutions: backup.institutions.length,
      accounts: backup.institutions.reduce((sum, institution) => sum + institution.accounts.length, 0),
      transactions: backup.institutions.reduce((sum, institution) => sum + institution.transactions.length, 0),
    },
    note: BANKS_KEPT_NOTE,
  };
}
