/**
 * Subscription audit over the stored bank snapshot and the user's tracked bills. Reads the local
 * database only: it never calls SimpleFIN (that would spend the 24 requests/day allowance on a page
 * view). See CONVENTIONS section 12 and the subscription-audit additions.
 */
import type { SubscriptionAuditResponse } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { detectRecurring } from "../../domain/recurring";
import { db, HOUSEHOLD_ID } from "../db";
import { historyCutoff } from "../simplefin-mapping";
import { listBills } from "./bills";
import { listIncome } from "./income";
import { getSettings } from "./settings";

export async function subscriptionAudit(accountId?: string, now: Date = new Date()): Promise<SubscriptionAuditResponse> {
  const today = todayLocal(now);
  const accountFilter = accountId
    ? { id: accountId, connection: { householdId: HOUSEHOLD_ID } }
    : { kind: "BANK", connection: { householdId: HOUSEHOLD_ID } };
  const [connections, rows, bills, incomes, settings, dismissed] = await Promise.all([
    db.bankConnection.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { lastSyncedAt: true } }),
    db.bankTransaction.findMany({
      // Bank accounts only, like the starting balance: a charge has to move money through one.
      where: { pending: false, date: { gte: historyCutoff(today) }, account: accountFilter },
      select: { date: true, description: true, amountCents: true, accountId: true },
    }),
    listBills(),
    listIncome(),
    getSettings(),
    db.dismissedRecurring.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { key: true } }),
  ]);

  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const suggestions = detectRecurring({ transactions: rows, incomes, bills, today, accountId }).filter(
    (s) => s.kind === "BILL" && !dismissedKeys.has(s.key),
  );

  const synced = connections.flatMap((c) => (c.lastSyncedAt ? [c.lastSyncedAt.getTime()] : []));
  return {
    suggestions,
    tracked: bills,
    currency: settings.currency,
    connectionCount: connections.length,
    transactionCount: rows.length,
    lastSyncedAt: synced.length ? new Date(Math.max(...synced)).toISOString() : null,
  };
}

/** Marks a suggestion key as "not a subscription" so the audit stops showing it. Idempotent. */
export async function dismissRecurring(key: string): Promise<void> {
  await db.dismissedRecurring.upsert({
    where: { householdId_key: { householdId: HOUSEHOLD_ID, key } },
    create: { householdId: HOUSEHOLD_ID, key },
    update: {},
  });
}
