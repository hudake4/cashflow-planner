import type { PrismaClient } from "@prisma/client";
import { DEFAULT_DEBT_MONTHLY_PAYMENT_CENTS, type DataRestoreInput } from "../contracts/api";
import { HOUSEHOLD_ID } from "./defaults";
import { badRequest } from "./http";

/** Replaces the planner's editable data in one transaction; bank and spending data stay put. */
export async function restoreData(prisma: PrismaClient, data: DataRestoreInput): Promise<void> {
  const incomeIds = data.incomes.map((row) => row.id);
  const billIds = data.bills.map((row) => row.id);
  const occurrenceKeys = data.billOccurrences.map((row) => `${row.billId}\0${row.dueDate}`);
  if (new Set(incomeIds).size !== incomeIds.length) throw badRequest("Backup contains duplicate income ids.");
  if (new Set(billIds).size !== billIds.length) throw badRequest("Backup contains duplicate bill ids.");
  if (new Set(occurrenceKeys).size !== occurrenceKeys.length) throw badRequest("Backup contains duplicate bill occurrences.");
  const bills = new Set(billIds);
  if (data.billOccurrences.some((row) => !bills.has(row.billId))) throw badRequest("Backup contains an occurrence for a bill that is not included.");

  await prisma.$transaction(async (tx) => {
    await tx.billOccurrence.deleteMany({ where: { bill: { householdId: HOUSEHOLD_ID } } });
    await tx.bill.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.createMany({
      data: data.incomes.map(({ id, name, amountCents, frequency, anchorDate, endDate, active, notes, createdAt, updatedAt }) => ({
        id, householdId: HOUSEHOLD_ID, name, amountCents, frequency, anchorDate, endDate, active, notes,
        createdAt: new Date(createdAt), updatedAt: new Date(updatedAt),
      })),
    });
    await tx.bill.createMany({
      data: data.bills.map(({ id, name, amountCents, frequency, anchorDate, endDate, category, notes, active, createdAt, updatedAt }) => ({
        id, householdId: HOUSEHOLD_ID, name, amountCents, frequency, anchorDate, endDate, category, notes, active,
        createdAt: new Date(createdAt), updatedAt: new Date(updatedAt),
      })),
    });
    await tx.billOccurrence.createMany({
      data: data.billOccurrences.map(({ billId, dueDate, status, amountOverrideCents, note, updatedAt }) => ({
        billId, dueDate, status, amountOverrideCents, note, updatedAt: new Date(updatedAt),
      })),
    });
    const { settings } = data;
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
        desktopNotifications: settings.desktopNotifications ?? true,
        balanceFloorCents: settings.balanceFloorCents ?? 0,
        debtMonthlyPaymentCents: settings.debtMonthlyPaymentCents ?? DEFAULT_DEBT_MONTHLY_PAYMENT_CENTS,
      },
      update: {
        startingBalanceCents: settings.startingBalanceCents,
        startingBalanceSource: settings.startingBalanceSource,
        projectionStartDate: settings.projectionStartDate,
        currency: settings.currency,
        forecastDays: settings.forecastDays,
        weekStartsOn: settings.weekStartsOn,
        defaultCalendarView: settings.defaultCalendarView,
        desktopNotifications: settings.desktopNotifications ?? true,
        balanceFloorCents: settings.balanceFloorCents ?? 0,
        debtMonthlyPaymentCents: settings.debtMonthlyPaymentCents ?? DEFAULT_DEBT_MONTHLY_PAYMENT_CENTS,
      },
    });
  });
}
