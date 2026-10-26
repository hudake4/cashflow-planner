/**
 * Recurring-payment scan over the stored bank snapshot. Reads the local database only: it
 * never calls SimpleFIN (that would spend the 24 requests/day allowance on a page view).
 */
import type { RecurringScanResponse } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { detectRecurring } from "../../domain/recurring";
import { db, HOUSEHOLD_ID } from "../db";
import { historyCutoff } from "../simplefin-mapping";
import { listBills } from "./bills";
import { listIncome } from "./income";
import { getSettings } from "./settings";

export async function scanRecurring(accountId?: string, now: Date = new Date()): Promise<RecurringScanResponse> {
  const today = todayLocal(now);
  const accountFilter = accountId
    ? { id: accountId, connection: { householdId: HOUSEHOLD_ID } }
    : { kind: "BANK", connection: { householdId: HOUSEHOLD_ID } };
  const [connections, rows, bills, incomes, settings] = await Promise.all([
    db.bankConnection.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { lastSyncedAt: true } }),
    db.bankTransaction.findMany({
      where: { pending: false, date: { gte: historyCutoff(today) }, account: accountFilter },
      select: { date: true, description: true, amountCents: true, accountId: true },
    }),
    listBills(),
    listIncome(),
    getSettings(),
  ]);

  const synced = connections.flatMap((c) => (c.lastSyncedAt ? [c.lastSyncedAt.getTime()] : []));
  return {
    suggestions: detectRecurring({ transactions: rows, incomes, bills, today, accountId }),
    currency: settings.currency,
    connectionCount: connections.length,
    transactionCount: rows.length,
    lastSyncedAt: synced.length ? new Date(Math.max(...synced)).toISOString() : null,
  };
}
