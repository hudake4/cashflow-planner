/**
 * Bank connections through SimpleFIN Bridge. Scoped by household ("local").
 *
 * The app keeps a local snapshot (accounts, balances, transactions) and only talks to
 * SimpleFIN when the user connects or presses Refresh, because SimpleFIN allows 24
 * requests/day and refreshes bank data roughly once a day. `accessUrl` holds credentials:
 * it is read only here (to hand to ../simplefin) and is never part of a DTO.
 */
import type { BankAccount, BankConnection } from "@prisma/client";
import type { z } from "zod";
import {
  MIN_SYNC_INTERVAL_MINUTES,
  type BankAccountDTO,
  type BankTransactionsResponse,
  type InstitutionDTO,
  type InstitutionSyncDTO,
  type connectInstitutionSchema,
} from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { db, HOUSEHOLD_ID } from "../db";
import { ApiError, notFound } from "../http";
import * as simplefin from "../simplefin";
import { historyCutoff, planSyncWindow } from "../simplefin-mapping";

export type ConnectData = z.output<typeof connectInstitutionSchema>;

const DEFAULT_NAME = "SimpleFIN connection";
const MIN_SYNC_INTERVAL_MS = MIN_SYNC_INTERVAL_MINUTES * 60_000;
const ID_CHUNK = 500;

type ConnectionWithAccounts = BankConnection & { accounts: BankAccount[] };

const toAccountDTO = (a: BankAccount): BankAccountDTO => ({
  id: a.id,
  name: a.name,
  institutionName: a.institutionName,
  currency: a.currency,
  balanceCents: a.balanceCents,
  availableBalanceCents: a.availableBalanceCents,
  balanceDate: a.balanceDate,
});

/** Never includes the access URL. */
function toInstitutionDTO(row: ConnectionWithAccounts): InstitutionDTO {
  const accounts = [...row.accounts].sort(
    (a, b) => a.institutionName.localeCompare(b.institutionName) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const names = [...new Set(accounts.map((a) => a.institutionName))];
  return {
    id: row.id,
    name: names.length ? names.join(", ") : DEFAULT_NAME,
    connectedAt: row.createdAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    accounts: accounts.map(toAccountDTO),
  };
}

async function getConnection(id: string): Promise<ConnectionWithAccounts> {
  const row = await db.bankConnection.findFirst({ where: { id, householdId: HOUSEHOLD_ID }, include: { accounts: true } });
  if (!row) throw notFound("Connection");
  return row;
}

export async function listConnections(): Promise<InstitutionDTO[]> {
  const rows = await db.bankConnection.findMany({
    where: { householdId: HOUSEHOLD_ID },
    include: { accounts: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toInstitutionDTO);
}

// Connections being synced right now (this process), so a double click can't fire two requests.
const syncing = new Set<string>();

/**
 * Fetches the planned window from SimpleFIN and, in one transaction, upserts the accounts
 * and replaces their transactions: every pending row, plus non-pending rows dated inside
 * the window. Rows older than HISTORY_DAYS are then pruned. Accounts that SimpleFIN flagged with an error keep their
 * stored transactions (an empty list from a failing bank must not wipe history).
 * `lastSyncedAt` moves only after a successful fetch, so a failed sync can be retried.
 */
async function runSync(row: BankConnection, now: Date): Promise<string[]> {
  const window = planSyncWindow(row.lastSyncedAt, now);
  const set = await simplefin.fetchAccountSet(row.accessUrl, {
    start: window.start,
    end: window.end,
    pending: true,
    today: todayLocal(now),
  });

  await db.$transaction(async (tx) => {
    for (const a of set.accounts) {
      const id = `${row.id}:${a.providerAccountId}`;
      const fields = {
        providerAccountId: a.providerAccountId,
        institutionName: a.institutionName,
        name: a.name,
        currency: a.currency,
        balanceCents: a.balanceCents,
        availableBalanceCents: a.availableBalanceCents,
        balanceDate: a.balanceDate,
      };
      await tx.bankAccount.upsert({
        where: { id },
        create: { id, connectionId: row.id, ...fields },
        update: fields,
      });
      if (a.incomplete) continue;

      // Rows fetched again replace their stored copy, even one dated before the window.
      const fetchedIds = a.transactions.map((t) => `${id}:${t.providerTransactionId}`);
      for (let i = 0; i < fetchedIds.length; i += ID_CHUNK) {
        await tx.bankTransaction.deleteMany({ where: { accountId: id, id: { in: fetchedIds.slice(i, i + ID_CHUNK) } } });
      }
      await tx.bankTransaction.deleteMany({
        where: { accountId: id, OR: [{ pending: true }, { date: { gte: window.startDate } }] },
      });
      if (a.transactions.length) {
        await tx.bankTransaction.createMany({
          data: a.transactions.map((t) => ({
            id: `${id}:${t.providerTransactionId}`,
            accountId: id,
            date: t.date,
            amountCents: t.amountCents,
            description: t.description,
            pending: t.pending,
          })),
        });
      }
    }
    // Only the last HISTORY_DAYS days are kept, whatever the bank returned.
    await tx.bankTransaction.deleteMany({
      where: { account: { connectionId: row.id }, date: { lt: historyCutoff(todayLocal(now)) } },
    });
    await tx.bankConnection.update({ where: { id: row.id }, data: { lastSyncedAt: now } });
  });
  return set.warnings;
}

/** Refreshes one connection. Needs at least 15 minutes since the last successful sync (409 otherwise). */
export async function syncConnection(id: string, now: Date = new Date()): Promise<InstitutionSyncDTO> {
  const row = await getConnection(id);
  if (row.lastSyncedAt) {
    const wait = MIN_SYNC_INTERVAL_MS - (now.getTime() - row.lastSyncedAt.getTime());
    if (wait > 0) {
      throw new ApiError(
        409,
        "CONFLICT",
        `This connection was refreshed a moment ago. SimpleFIN limits requests, so try again in ${Math.ceil(wait / 60_000)} minute(s).`,
      );
    }
  }
  if (syncing.has(id)) throw new ApiError(409, "CONFLICT", "A refresh is already running for this connection.");

  syncing.add(id);
  try {
    const warnings = await runSync(row, now);
    return { ...toInstitutionDTO(await getConnection(id)), warnings };
  } finally {
    syncing.delete(id);
  }
}

/**
 * Claims the setup token (it works only once), saves the connection, then runs the first
 * sync. If that sync fails the connection is KEPT, because the token cannot be claimed
 * again: the result carries a warning and the user can press Refresh.
 */
export async function connect(input: ConnectData, now: Date = new Date()): Promise<InstitutionSyncDTO> {
  const accessUrl = await simplefin.claimSetupToken(input.setupToken);
  const created = await db.bankConnection.create({ data: { householdId: HOUSEHOLD_ID, accessUrl } });

  let warnings: string[];
  syncing.add(created.id);
  try {
    warnings = await runSync(created, now);
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("[institutions] first sync failed", err instanceof Error ? err.name : "unknown error");
    const reason = err instanceof ApiError ? err.message : "An unexpected error occurred.";
    warnings = [`The bank connection was saved, but the first sync failed: ${reason} Press Refresh to try again.`];
  } finally {
    syncing.delete(created.id);
  }
  return { ...toInstitutionDTO(await getConnection(created.id)), warnings };
}

/**
 * Deletes the connection, its accounts and its stored transactions from this app only.
 * SimpleFIN has no revoke API: the user disables the token in their SimpleFIN account.
 */
export async function removeConnection(id: string): Promise<void> {
  await getConnection(id);
  await db.bankConnection.delete({ where: { id } });
}

/** Stored transactions of one account from the last HISTORY_DAYS days, newest first. 404 when the account isn't part of the connection. */
export async function listTransactions(
  connectionId: string,
  accountId: string,
  { offset, limit }: { offset: number; limit: number },
  now: Date = new Date(),
): Promise<BankTransactionsResponse> {
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, connectionId, connection: { householdId: HOUSEHOLD_ID } },
    select: { id: true },
  });
  if (!account) throw notFound("Account");

  const rows = await db.bankTransaction.findMany({
    where: { accountId, date: { gte: historyCutoff(todayLocal(now)) } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    skip: offset,
    take: limit + 1,
  });
  return {
    transactions: rows.slice(0, limit).map((t) => ({
      id: t.id,
      accountId: t.accountId,
      date: t.date,
      description: t.description,
      amountCents: t.amountCents,
      pending: t.pending,
    })),
    hasMore: rows.length > limit,
  };
}
