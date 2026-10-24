/**
 * Spend analyzer over the stored bank snapshot. Reads the local database only: it never calls
 * SimpleFIN (that would spend the 24 requests/day allowance on a page view).
 */
import type { SpendingResponse } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { buildSpending } from "../../domain/spending";
import { db, HOUSEHOLD_ID } from "../db";
import { historyCutoff } from "../simplefin-mapping";
import { getSettings } from "./settings";

export async function getSpending(now: Date = new Date()): Promise<SpendingResponse> {
  const today = todayLocal(now);
  const [connections, rows, settings] = await Promise.all([
    db.bankConnection.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { lastSyncedAt: true } }),
    db.bankTransaction.findMany({
      where: { pending: false, date: { gte: historyCutoff(today) }, account: { connection: { householdId: HOUSEHOLD_ID } } },
      select: { date: true, description: true, amountCents: true },
    }),
    getSettings(),
  ]);

  const synced = connections.flatMap((c) => (c.lastSyncedAt ? [c.lastSyncedAt.getTime()] : []));
  return {
    ...buildSpending({ transactions: rows, today }),
    currency: settings.currency,
    connectionCount: connections.length,
    transactionCount: rows.length,
    lastSyncedAt: synced.length ? new Date(Math.max(...synced)).toISOString() : null,
  };
}
