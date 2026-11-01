/**
 * Global search over the local database (CONVENTIONS section 20). Reads stored rows only and
 * never calls SimpleFIN. Rows are loaded for the household and matched in JavaScript with the
 * pure helpers in domain/search, so accents, case and the ranking rules are the same for
 * every group (and `%` or `_` in a query are plain characters, not wildcards). The data is
 * small: a few hundred schedules and the bank history (HISTORY_DAYS, a few thousand rows).
 */
import type { AccountKind, SearchResponse, SearchResultDTO } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { FREQUENCY_LABELS } from "../../domain/frequency-labels";
import {
  RANK_AMOUNT,
  amountMatches,
  normalizeQuery,
  parseAmountQuery,
  rankFields,
  selectTop,
} from "../../domain/search";
import { db, HOUSEHOLD_ID } from "../db";
import { defaultSettings } from "../defaults";
import { historyCutoff } from "../simplefin-mapping";

const ACCOUNT_KIND_LABELS: Record<string, string> = {
  BANK: "Bank",
  CREDIT: "Credit",
  LOAN: "Loan",
  OTHER: "Other",
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byNameThenId = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name) || compareText(a.id, b.id);

const joinParts = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(" · ") || null;
const frequencyLabel = (frequency: string) => FREQUENCY_LABELS[frequency as keyof typeof FREQUENCY_LABELS] ?? frequency;

/** `limit` is a cap per group. `rawQuery` is expected to be non-empty once trimmed (searchInputSchema). */
export async function search(rawQuery: string, limit: number, now: Date = new Date()): Promise<SearchResponse> {
  const query = normalizeQuery(rawQuery);
  const amountQuery = parseAmountQuery(rawQuery);
  const where = { householdId: HOUSEHOLD_ID };

  const [settings, bills, income, goals, accounts, transactions] = await Promise.all([
    db.settings.findUnique({ where, select: { currency: true } }),
    db.bill.findMany({ where }),
    db.incomeSource.findMany({ where }),
    db.savingsGoal.findMany({ where }),
    db.bankAccount.findMany({ where: { connection: where } }),
    db.bankTransaction.findMany({
      where: { date: { gte: historyCutoff(todayLocal(now)) }, account: { connection: where } },
      include: { account: { select: { name: true, institutionName: true, currency: true } } },
    }),
  ]);
  const currency = settings?.currency ?? defaultSettings().currency;

  const billResults = selectTop(
    bills,
    (b) => rankFields(query, [b.name], [b.category, b.notes]),
    byNameThenId,
    limit,
  ).map<SearchResultDTO>((b) => ({
    id: b.id,
    kind: "BILL",
    title: b.name,
    subtitle: joinParts(b.category, frequencyLabel(b.frequency), !b.active && "Paused"),
    amountCents: b.amountCents,
    currency,
    href: `/bills?edit=${encodeURIComponent(b.id)}`,
  }));

  const incomeResults = selectTop(
    income,
    (i) => rankFields(query, [i.name], [i.notes]),
    byNameThenId,
    limit,
  ).map<SearchResultDTO>((i) => ({
    id: i.id,
    kind: "INCOME",
    title: i.name,
    subtitle: joinParts(frequencyLabel(i.frequency), !i.active && "Paused"),
    amountCents: i.amountCents,
    currency,
    href: `/income?edit=${encodeURIComponent(i.id)}`,
  }));

  // Newest first within the same rank. An amount equal to the typed one counts like a prefix match.
  const transactionResults = selectTop(
    transactions,
    (t) => {
      const text = rankFields(query, [t.description], [t.account.name, t.account.institutionName, t.date]);
      if (!amountMatches(t.amountCents, amountQuery)) return text;
      return text === null ? RANK_AMOUNT : Math.min(text, RANK_AMOUNT);
    },
    (a, b) => compareText(b.date, a.date) || compareText(b.id, a.id),
    limit,
  ).map<SearchResultDTO>((t) => ({
    id: t.id,
    kind: "TRANSACTION",
    title: t.description,
    subtitle: joinParts(t.account.name, t.account.institutionName, t.date, t.pending && "Pending"),
    amountCents: t.amountCents,
    currency: t.account.currency,
    href: "/spending",
  }));

  const goalResults = selectTop(
    goals.map((g) => ({ ...g, name: g.name || "Savings goal" })),
    (g) => rankFields(query, [g.name]),
    byNameThenId,
    limit,
  ).map<SearchResultDTO>((g) => ({
    id: g.id,
    kind: "GOAL",
    title: g.name,
    subtitle: `Target date ${g.targetDate}`,
    amountCents: g.targetAmountCents,
    currency,
    href: "/savings-goals",
  }));

  const accountResults = selectTop(
    accounts,
    (a) =>
      rankFields(query, [a.name], [a.institutionName, a.kind, ACCOUNT_KIND_LABELS[a.kind as AccountKind]]),
    byNameThenId,
    limit,
  ).map<SearchResultDTO>((a) => ({
    id: a.id,
    kind: "ACCOUNT",
    title: a.name,
    subtitle: joinParts(a.institutionName, ACCOUNT_KIND_LABELS[a.kind] ?? a.kind),
    amountCents: null,
    currency: null,
    href: `/institutions/${encodeURIComponent(a.connectionId)}?account=${encodeURIComponent(a.id)}`,
  }));

  return {
    query: rawQuery.trim(),
    results: [...billResults, ...incomeResults, ...transactionResults, ...goalResults, ...accountResults],
  };
}
