/**
 * Spend analyzer over the stored bank snapshot. Reads the local database only: it never calls
 * SimpleFIN (that would spend the 24 requests/day allowance on a page view).
 *
 * The user's category choices live in two small tables (prisma/schema.prisma): one per transaction
 * (`TransactionCategory`) and one per merchant (`MerchantCategoryRule`, what the analyzer has learned).
 */
import { SPENDING_CATEGORIES } from "../../contracts/api";
import type { SpendingCategory, SpendingCategoryInput, SpendingResponse } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { buildSpending, merchantKey } from "../../domain/spending";
import { db, HOUSEHOLD_ID } from "../db";
import { badRequest, notFound } from "../http";
import { historyCutoff } from "../simplefin-mapping";
import { getSettings } from "./settings";

const isCategory = (value: string): value is SpendingCategory => (SPENDING_CATEGORIES as readonly string[]).includes(value);

/** Stored values are validated on the way in; a row written by a newer or hand-edited database is ignored, not trusted. */
function categoryMap<T extends { category: string }>(rows: T[], key: (row: T) => string): Map<string, SpendingCategory> {
  const map = new Map<string, SpendingCategory>();
  for (const row of rows) if (isCategory(row.category)) map.set(key(row), row.category);
  return map;
}

export async function getSpending(now: Date = new Date()): Promise<SpendingResponse> {
  const today = todayLocal(now);
  const [connections, rows, settings, overrides, rules] = await Promise.all([
    db.bankConnection.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { lastSyncedAt: true } }),
    db.bankTransaction.findMany({
      where: { pending: false, date: { gte: historyCutoff(today) }, account: { connection: { householdId: HOUSEHOLD_ID } } },
      select: { id: true, date: true, description: true, amountCents: true },
    }),
    getSettings(),
    db.transactionCategory.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { transactionId: true, category: true } }),
    db.merchantCategoryRule.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { merchantKey: true, category: true } }),
  ]);

  const synced = connections.flatMap((c) => (c.lastSyncedAt ? [c.lastSyncedAt.getTime()] : []));
  return {
    ...buildSpending({
      transactions: rows,
      today,
      overrides: categoryMap(overrides, (o) => o.transactionId),
      merchantRules: categoryMap(rules, (r) => r.merchantKey),
    }),
    currency: settings.currency,
    connectionCount: connections.length,
    transactionCount: rows.length,
    lastSyncedAt: synced.length ? new Date(Math.max(...synced)).toISOString() : null,
  };
}

/**
 * Records the user's category for a transaction and returns the refreshed analysis.
 *
 * With `applyToMerchant` the choice is also remembered for the transaction's merchant, so it covers
 * the merchant's other transactions and the ones that arrive later (the latest choice wins), and it
 * replaces any per-transaction choices for that merchant. Without it only this transaction changes.
 * A null category undoes the choice the same way, back to the automatic category.
 */
export async function setTransactionCategory(transactionId: string, input: SpendingCategoryInput, now: Date = new Date()): Promise<SpendingResponse> {
  const { category, applyToMerchant = true } = input;
  const today = todayLocal(now);
  const cutoff = historyCutoff(today);

  const tx = await db.bankTransaction.findFirst({
    where: { id: transactionId, pending: false, date: { gte: cutoff }, account: { connection: { householdId: HOUSEHOLD_ID } } },
    select: { id: true, date: true, description: true, amountCents: true },
  });
  if (!tx) throw notFound("Transaction");
  if (tx.amountCents >= 0) throw badRequest("Only money out can be categorized.");

  const key = merchantKey(tx.description);
  if (applyToMerchant && !key) throw badRequest("This transaction has no merchant name to learn from. Change just this one.");

  await db.$transaction(async (trx) => {
    // Old choices for transactions that have left the history window can never show again.
    await trx.transactionCategory.deleteMany({ where: { householdId: HOUSEHOLD_ID, date: { lt: cutoff } } });

    if (!applyToMerchant) {
      if (category === null) await trx.transactionCategory.deleteMany({ where: { transactionId: tx.id } });
      else {
        await trx.transactionCategory.upsert({
          where: { transactionId: tx.id },
          create: { transactionId: tx.id, householdId: HOUSEHOLD_ID, category, date: tx.date },
          update: { category, date: tx.date },
        });
      }
      return;
    }

    const candidates = await trx.bankTransaction.findMany({
      where: { date: { gte: cutoff }, account: { connection: { householdId: HOUSEHOLD_ID } } },
      select: { id: true, description: true },
    });
    const sameMerchant = candidates.filter((c) => merchantKey(c.description) === key).map((c) => c.id);
    await trx.transactionCategory.deleteMany({ where: { transactionId: { in: sameMerchant } } });

    if (category === null) await trx.merchantCategoryRule.deleteMany({ where: { householdId: HOUSEHOLD_ID, merchantKey: key } });
    else {
      await trx.merchantCategoryRule.upsert({
        where: { householdId_merchantKey: { householdId: HOUSEHOLD_ID, merchantKey: key } },
        create: { householdId: HOUSEHOLD_ID, merchantKey: key, category },
        update: { category },
      });
    }
  });

  return getSpending(now);
}
