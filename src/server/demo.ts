/**
 * Clearly labeled demo data ("Demo: " prefix on every name), shared by
 * `prisma/seed.ts` and `POST /api/data/demo`. Loading it REPLACES all income,
 * bills and occurrences, and sets the start date to today and the starting
 * balance to $1,250.00.
 *
 * Dates are relative to `today`, so the demo always looks current. The one-time
 * car repair lands 3 days in, before the next main paycheck (day 6), and that
 * guarantees an early negative dip that exercises the warning UI. The monthly
 * surplus (about +$1,900) then brings the balance back up.
 */
import type { PrismaClient } from "@prisma/client";
import { addDays, formatIsoDate, parseIsoDate } from "../domain/dates";
import { defaultSettings, HOUSEHOLD_ID } from "./defaults";

export const DEMO_STARTING_BALANCE_CENTS = 125_000;

type DemoIncome = { name: string; amountCents: number; frequency: string; anchorDate: string; notes?: string };
type DemoBill = DemoIncome & { category: string };

export function buildDemoData(today: string): { incomes: DemoIncome[]; bills: DemoBill[] } {
  const { year, month } = parseIsoDate(today);
  const thisMonth = (day: number) => formatIsoDate(year, month, day);
  const inDays = (n: number) => addDays(today, n);

  return {
    incomes: [
      { name: "Demo: Main job paycheck", amountCents: 185_000, frequency: "BIWEEKLY", anchorDate: inDays(6) },
      { name: "Demo: Part-time job", amountCents: 24_000, frequency: "WEEKLY", anchorDate: inDays(2) },
    ],
    bills: [
      { name: "Demo: Rent", amountCents: 165_000, frequency: "MONTHLY", anchorDate: thisMonth(1), category: "Housing" },
      {
        name: "Demo: Car loan (due on the 31st)",
        amountCents: 38_500,
        frequency: "MONTHLY",
        anchorDate: formatIsoDate(year, 1, 31), // Jan 31: shows month-end clamping (Feb 28, Apr 30, ...)
        category: "Transportation",
        notes: "Due on the 31st; shorter months fall back to the last day of the month.",
      },
      { name: "Demo: Electric & water", amountCents: 14_000, frequency: "MONTHLY", anchorDate: thisMonth(15), category: "Utilities" },
      { name: "Demo: Phone & internet", amountCents: 9_500, frequency: "MONTHLY", anchorDate: thisMonth(20), category: "Utilities" },
      { name: "Demo: Groceries", amountCents: 16_000, frequency: "WEEKLY", anchorDate: inDays(1), category: "Food" },
      { name: "Demo: Car insurance", amountCents: 42_000, frequency: "QUARTERLY", anchorDate: inDays(20), category: "Insurance" },
      { name: "Demo: Streaming membership (annual)", amountCents: 13_900, frequency: "YEARLY", anchorDate: inDays(45), category: "Subscriptions" },
      {
        name: "Demo: Car repair",
        amountCents: 160_000,
        frequency: "ONE_TIME",
        anchorDate: inDays(3),
        category: "Transportation",
        notes: "One-time expense before payday: causes a short negative dip.",
      },
    ],
  };
}

/** Replaces all household data with the demo set, atomically. */
export async function loadDemoData(prisma: PrismaClient, today: string): Promise<void> {
  const { incomes, bills } = buildDemoData(today);
  const defaults = defaultSettings(today);

  await prisma.$transaction(async (tx) => {
    await tx.billOccurrence.deleteMany({ where: { bill: { householdId: HOUSEHOLD_ID } } });
    await tx.bill.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.deleteMany({ where: { householdId: HOUSEHOLD_ID } });

    await tx.incomeSource.createMany({ data: incomes.map((i) => ({ ...i, householdId: HOUSEHOLD_ID })) });
    await tx.bill.createMany({ data: bills.map((b) => ({ ...b, householdId: HOUSEHOLD_ID })) });

    // Keep the user's display preferences; only the start date and balance change.
    await tx.settings.upsert({
      where: { householdId: HOUSEHOLD_ID },
      create: {
        householdId: HOUSEHOLD_ID,
        startingBalanceCents: DEMO_STARTING_BALANCE_CENTS,
        projectionStartDate: today,
        currency: defaults.currency,
        forecastDays: defaults.forecastDays,
        weekStartsOn: defaults.weekStartsOn,
        defaultCalendarView: defaults.defaultCalendarView,
      },
      update: { startingBalanceCents: DEMO_STARTING_BALANCE_CENTS, startingBalanceSource: "MANUAL", projectionStartDate: today },
    });
  });
}

/** Deletes all household data and settings (settings fall back to defaults). */
export async function resetAllData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.billOccurrence.deleteMany({ where: { bill: { householdId: HOUSEHOLD_ID } } });
    await tx.bill.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.incomeSource.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    // Accounts and their transactions cascade. SimpleFIN has no revoke API, so the user disables the token there.
    await tx.bankConnection.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
    await tx.settings.deleteMany({ where: { householdId: HOUSEHOLD_ID } });
  });
}
