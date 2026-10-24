import type { BankAccount, BankEnrollment } from "@prisma/client";
import type { z } from "zod";
import {
  BANK_TRANSACTIONS_PAGE_SIZE,
  type BankTransactionsQuery,
  type BankTransactionsResponse,
  type InstitutionDTO,
  type connectInstitutionSchema,
} from "../../contracts/api";
import { db, HOUSEHOLD_ID } from "../db";
import { badRequest, notFound } from "../http";
import * as teller from "../teller";
import { toBankAccountDTO, toBankTransactionDTO } from "../teller-mapping";

export type ConnectData = z.output<typeof connectInstitutionSchema>;

type EnrollmentWithAccounts = BankEnrollment & { accounts: BankAccount[] };

/** Never includes the access token. */
function toInstitutionDTO(row: EnrollmentWithAccounts): InstitutionDTO {
  return {
    id: row.id,
    institutionId: row.institutionId,
    name: row.institutionName,
    connectedAt: row.createdAt.toISOString(),
    accounts: [...row.accounts]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        lastFour: a.lastFour,
        currency: a.currency,
        status: a.status,
      })),
  };
}

export async function listInstitutions(): Promise<InstitutionDTO[]> {
  const rows = await db.bankEnrollment.findMany({
    where: { householdId: HOUSEHOLD_ID },
    include: { accounts: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toInstitutionDTO);
}

async function getEnrollment(id: string): Promise<EnrollmentWithAccounts> {
  const row = await db.bankEnrollment.findFirst({ where: { id, householdId: HOUSEHOLD_ID }, include: { accounts: true } });
  if (!row) throw notFound("Institution");
  return row;
}

export async function getInstitution(id: string): Promise<InstitutionDTO> {
  return toInstitutionDTO(await getEnrollment(id));
}

/**
 * Saves the enrollment returned by Teller Connect. The token is validated first by
 * listing the accounts; nothing is stored if Teller rejects it. Connecting the same
 * enrollment again replaces its accounts.
 */
export async function connectInstitution(input: ConnectData): Promise<InstitutionDTO> {
  if (!teller.isConfigured()) throw badRequest("Teller is not configured.");
  const accounts = await teller.listAccounts(input.accessToken);
  const institutionId = input.institutionId ?? accounts[0]?.institution?.id ?? input.institutionName;

  const row = await db.$transaction(async (tx) => {
    await tx.bankAccount.deleteMany({ where: { enrollmentId: input.enrollmentId } });
    await tx.bankEnrollment.upsert({
      where: { id: input.enrollmentId },
      create: {
        id: input.enrollmentId,
        householdId: HOUSEHOLD_ID,
        institutionId,
        institutionName: input.institutionName,
        accessToken: input.accessToken,
      },
      update: { institutionId, institutionName: input.institutionName, accessToken: input.accessToken },
    });
    await tx.bankAccount.createMany({
      data: accounts.map((a) => {
        const dto = toBankAccountDTO(a);
        return { ...dto, enrollmentId: input.enrollmentId };
      }),
    });
    return tx.bankEnrollment.findUniqueOrThrow({ where: { id: input.enrollmentId }, include: { accounts: true } });
  });
  return toInstitutionDTO(row);
}

/** Newest page, or the page older than `fromId`. Fetched live; nothing is stored. */
export async function listTransactions(id: string, query: BankTransactionsQuery): Promise<BankTransactionsResponse> {
  const enrollment = await getEnrollment(id);
  const account = enrollment.accounts.find((a) => a.id === query.accountId);
  if (!account) throw notFound("Account");
  const rows = await teller.listTransactions(enrollment.accessToken, account.id, {
    count: BANK_TRANSACTIONS_PAGE_SIZE,
    fromId: query.fromId,
  });
  return {
    transactions: rows.map((t) => toBankTransactionDTO(t)),
    hasMore: rows.length >= BANK_TRANSACTIONS_PAGE_SIZE,
  };
}

/** Best-effort revoke of every enrollment at Teller, for "clear all data". Local rows are deleted by the caller. */
export async function revokeAllInstitutions(): Promise<void> {
  const rows = await db.bankEnrollment.findMany({ where: { householdId: HOUSEHOLD_ID }, select: { accessToken: true } });
  await Promise.all(
    rows.map((r) =>
      teller.revokeEnrollment(r.accessToken).catch((err: unknown) => {
        console.warn("[teller] could not revoke enrollment during reset", err instanceof Error ? err.message : err);
      }),
    ),
  );
}

/** Best-effort revoke at Teller (failures are logged), then delete the local rows. */
export async function removeInstitution(id: string): Promise<void> {
  const enrollment = await getEnrollment(id);
  try {
    await teller.revokeEnrollment(enrollment.accessToken);
  } catch (err) {
    console.warn("[teller] could not revoke enrollment; removing it locally anyway", err instanceof Error ? err.message : err);
  }
  await db.bankEnrollment.delete({ where: { id } });
}
