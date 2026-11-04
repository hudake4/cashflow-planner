/**
 * Recap: the week and month review (CONVENTIONS section 22). Pure: no Prisma, no clock (today is
 * passed in), no I/O.
 *
 * Each period shows income, tracked bills paid and spending, next to the previous period. Spending is
 * the Spend Analyzer's own figure (`resolveSpends` and `buildPeriod`), so the two pages never disagree.
 */
import type { ReviewAnalysisDTO, ReviewCategoryDTO, ReviewComparisonDTO, ReviewPeriodDTO, ReviewTotalsDTO, SpendingCategory } from "../contracts/api";
import { SPENDING_CATEGORIES } from "../contracts/api";
import { matchBankTransfers } from "./card-payments";
import { addDays, diffDays, startOfWeek } from "./dates";
import { buildPeriod, categorize, coverageStartOf, looksLikeRefund, monthRanges, resolveSpends, type SpendingInput } from "./spending";

/** A tracked bill occurrence the user marked PAID. */
export interface PaidBill {
  /** The scheduled due date, YYYY-MM-DD. */
  dueDate: string;
  /** The amount for this occurrence (an entered override, else the bill's amount). Positive magnitude. */
  amountCents: number;
}

export interface ReviewInput extends SpendingInput {
  paidBills: readonly PaidBill[];
  /** 0 = Sunday ... 6 = Saturday: the first day of a week. */
  weekStartsOn: number;
}

interface Deposit {
  date: string;
  cents: number;
}

/**
 * Money in that is income: a deposit to a `BANK` account. Left out are what only moves money around
 * (a transfer by its words, or the receipt of the same amount leaving another bank account within a
 * few days; card payments arrive on `CREDIT` accounts, which are never income) and refunds.
 */
function incomeDeposits(input: ReviewInput["transactions"]): Deposit[] {
  const received = matchBankTransfers(
    input.flatMap((t) => (t.accountKind && t.accountId ? [{ id: t.id, date: t.date, amountCents: t.amountCents, accountKind: t.accountKind, accountId: t.accountId }] : [])),
  );
  return input
    .filter((t) => t.accountKind === "BANK" && t.amountCents > 0 && !received.has(t.id) && categorize(t.description) !== "TRANSFERS" && !looksLikeRefund(t.description))
    .map((t) => ({ date: t.date, cents: t.amountCents }));
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

function sumBetween(items: readonly { date: string; cents: number }[], from: string, to: string): { cents: number; count: number } {
  let cents = 0;
  let count = 0;
  for (const item of items) {
    if (!inRange(item.date, from, to)) continue;
    cents += item.cents;
    count += 1;
  }
  return { cents, count };
}

export function buildReview(input: ReviewInput): ReviewAnalysisDTO {
  const { today, weekStartsOn } = input;
  const spends = resolveSpends(input);
  const deposits = incomeDeposits(input.transactions);
  const bills = input.paidBills.map((b) => ({ date: b.dueDate, cents: b.amountCents }));

  const totals = (from: string, to: string): { totals: ReviewTotalsDTO; categories: ReadonlyMap<SpendingCategory, number> } => {
    const spending = buildPeriod(spends, from, to);
    const income = sumBetween(deposits, from, to).cents;
    const paid = sumBetween(bills, from, to);
    return {
      totals: {
        incomeCents: income,
        billsCents: paid.cents,
        billsCount: paid.count,
        spendingCents: spending.totalCents,
        netCents: income - spending.totalCents,
      },
      categories: new Map(spending.categories.map((c) => [c.category, c.totalCents])),
    };
  };

  const compare = (cur: [string, string], prev: [string, string], prevToDate: string): ReviewComparisonDTO => {
    const current = totals(...cur);
    const previous = totals(...prev);
    const categories: ReviewCategoryDTO[] = SPENDING_CATEGORIES.filter((c) => c !== "TRANSFERS")
      .map((category) => ({ category, currentCents: current.categories.get(category) ?? 0, previousCents: previous.categories.get(category) ?? 0 }))
      .filter((c) => c.currentCents > 0 || c.previousCents > 0)
      .sort(
        (a, b) =>
          b.currentCents - a.currentCents ||
          b.previousCents - a.previousCents ||
          SPENDING_CATEGORIES.indexOf(a.category) - SPENDING_CATEGORIES.indexOf(b.category),
      );
    const period = (t: ReviewTotalsDTO, [from, to]: [string, string]): ReviewPeriodDTO => ({ from, to, ...t });
    return {
      current: period(current.totals, cur),
      previous: period(previous.totals, prev),
      previousToDate: totals(prev[0], prevToDate).totals,
      categories,
    };
  };

  const { thisFrom, lastFrom, lastTo, lastSameDay } = monthRanges(today);
  const weekFrom = startOfWeek(today, weekStartsOn);
  const lastWeekFrom = addDays(weekFrom, -7);

  return {
    month: compare([thisFrom, today], [lastFrom, lastTo], lastSameDay),
    week: compare([weekFrom, today], [lastWeekFrom, addDays(weekFrom, -1)], addDays(lastWeekFrom, diffDays(weekFrom, today))),
    coverageStart: coverageStartOf(input.transactions),
  };
}
