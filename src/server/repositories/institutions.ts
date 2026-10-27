/**
 * Bank connections through SimpleFIN Bridge. Scoped by household ("local").
 *
 * The app keeps a local snapshot (accounts, balances, transactions) and only talks to
 * SimpleFIN when the user connects or presses Refresh, because SimpleFIN allows 24
 * requests/day and refreshes bank data roughly once a day. `accessUrl` holds credentials:
 * it is stored encrypted when a sealer exists (see ../secret-box), decrypted only here
 * (to hand to ../simplefin) and is never part of a DTO.
 */
import type { BankAccount, BankConnection, BankTransaction } from "@prisma/client";
import type { z } from "zod";
import {
  MIN_SYNC_INTERVAL_MINUTES,
  type AccountKind,
  type BankAccountDTO,
  type BankTransactionDTO,
  type BankTransactionsResponse,
  type InstitutionDTO,
  type InstitutionSyncDTO,
  type connectInstitutionSchema,
} from "../../contracts/api";
import { guessAccountKind } from "../../domain/account-kind";
import { parseIsoDate, todayLocal } from "../../domain/dates";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { ApiError, notFound } from "../http";
import { isEncrypted, open, seal, SecretUnavailableError } from "../secret-box";
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
  kind: a.kind as AccountKind,
  currency: a.currency,
  balanceCents: a.balanceCents,
  availableBalanceCents: a.availableBalanceCents,
  balanceDate: a.balanceDate,
  statementClosingDay: a.statementClosingDay,
  paymentDueDay: a.paymentDueDay,
  statementClosingDate: a.statementClosingDate,
  paymentDueDate: a.paymentDueDate,
  aprBasisPoints: a.aprBasisPoints,
  minimumPaymentRule: a.minimumPaymentRule,
});

const toTransactionDTO = (t: BankTransaction): BankTransactionDTO => ({
  id: t.id,
  accountId: t.accountId,
  date: t.date,
  description: t.description,
  amountCents: t.amountCents,
  pending: t.pending,
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

export async function listConnections(client: DbClient = db): Promise<InstitutionDTO[]> {
  const rows = await client.bankConnection.findMany({
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
/**
 * Decrypts the stored Access URL. A legacy plaintext value is upgraded in place (best effort)
 * as soon as a sealer is available, so existing connections are encrypted on their next use.
 */
async function readAccessUrl(row: BankConnection): Promise<string> {
  let accessUrl: string;
  try {
    accessUrl = open(row.accessUrl);
  } catch (err) {
    if (!(err instanceof SecretUnavailableError)) throw err;
    throw new ApiError(
      409,
      "CONFLICT",
      "The stored SimpleFIN credentials cannot be decrypted here. Remove this connection and connect again with a new setup token.",
    );
  }
  if (!isEncrypted(row.accessUrl)) {
    try {
      const sealed = seal(accessUrl);
      if (isEncrypted(sealed)) await db.bankConnection.update({ where: { id: row.id }, data: { accessUrl: sealed } });
    } catch {
      // Not fatal: the plaintext value keeps working and is upgraded on the next sync.
    }
  }
  return accessUrl;
}

async function runSync(row: BankConnection, now: Date): Promise<string[]> {
  const window = planSyncWindow(row.lastSyncedAt, now);
  const set = await simplefin.fetchAccountSet(await readAccessUrl(row), {
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
      // `kind` is set only on create: a sync never overwrites the user's label.
      await tx.bankAccount.upsert({
        where: { id },
        create: { id, connectionId: row.id, kind: guessAccountKind(a.name, a.balanceCents), ...fields },
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
  const created = await db.bankConnection.create({ data: { householdId: HOUSEHOLD_ID, accessUrl: seal(accessUrl) } });

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

/** Sets the user's label for one account. 404 when the account isn't part of the connection. */
export async function setAccountKind(connectionId: string, accountId: string, kind: AccountKind): Promise<BankAccountDTO> {
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, connectionId, connection: { householdId: HOUSEHOLD_ID } },
    select: { id: true },
  });
  if (!account) throw notFound("Account");
  return toAccountDTO(await db.bankAccount.update({ where: { id: accountId }, data: { kind } }));
}

/**
 * Sets credit-card fields for one account. 404 when the account isn't part of the connection.
 * A date also writes its day of month to the matching day column, so the two never disagree; a
 * day sent alone clears the stored date. When both are sent, the date wins.
 */
export async function setAccountCardFields(
  connectionId: string,
  accountId: string,
  fields: {
    statementClosingDay?: number | null;
    paymentDueDay?: number | null;
    statementClosingDate?: string | null;
    paymentDueDate?: string | null;
    aprBasisPoints?: number | null;
    minimumPaymentRule?: string | null;
  },
): Promise<BankAccountDTO> {
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, connectionId, connection: { householdId: HOUSEHOLD_ID } },
    select: { id: true },
  });
  if (!account) throw notFound("Account");
  const data: Record<string, unknown> = {};
  if (fields.statementClosingDate !== undefined) {
    data.statementClosingDate = fields.statementClosingDate;
    data.statementClosingDay = fields.statementClosingDate ? parseIsoDate(fields.statementClosingDate).day : null;
  } else if (fields.statementClosingDay !== undefined) {
    data.statementClosingDay = fields.statementClosingDay;
    data.statementClosingDate = null;
  }
  if (fields.paymentDueDate !== undefined) {
    data.paymentDueDate = fields.paymentDueDate;
    data.paymentDueDay = fields.paymentDueDate ? parseIsoDate(fields.paymentDueDate).day : null;
  } else if (fields.paymentDueDay !== undefined) {
    data.paymentDueDay = fields.paymentDueDay;
    data.paymentDueDate = null;
  }
  if (fields.aprBasisPoints !== undefined) data.aprBasisPoints = fields.aprBasisPoints;
  if (fields.minimumPaymentRule !== undefined) data.minimumPaymentRule = fields.minimumPaymentRule;
  return toAccountDTO(await db.bankAccount.update({ where: { id: accountId }, data }));
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
    transactions: rows.slice(0, limit).map(toTransactionDTO),
    hasMore: rows.length > limit,
  };
}

/**
 * Every stored transaction of the household, grouped by connection id, newest first
 * (date, then id). Unlike listTransactions this applies no history cutoff: it is for the
 * backup file, which keeps whatever is in the database.
 */
export async function listAllTransactionsByConnection(client: DbClient = db): Promise<Map<string, BankTransactionDTO[]>> {
  const rows = await client.bankTransaction.findMany({
    where: { account: { connection: { householdId: HOUSEHOLD_ID } } },
    include: { account: { select: { connectionId: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  const byConnection = new Map<string, BankTransactionDTO[]>();
  for (const row of rows) {
    const list = byConnection.get(row.account.connectionId) ?? [];
    list.push(toTransactionDTO(row));
    byConnection.set(row.account.connectionId, list);
  }
  return byConnection;
}
