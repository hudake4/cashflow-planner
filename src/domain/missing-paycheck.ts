/**
 * Missing-paycheck detection (CONVENTIONS section 16): an expected recurring income
 * deposit that hasn't shown up in the bank transactions. Pure: no Prisma, no clock
 * (`today` is passed in), no I/O. It is a separate step from `buildAlerts`, which only
 * reads the projection; this module reads the income sources and the bank history.
 *
 * Design choices:
 *   - Only `WEEKLY` and `BIWEEKLY` incomes are watched. `ONE_TIME` is excluded because a
 *     one-time deposit that never arrives is not a "paycheck", and `MONTHLY` is excluded
 *     because a ~14-day lookback window is tuned for paydays that repeat inside it (a
 *     monthly salary would only be "missing" for a narrow slice of its cycle).
 *   - Nothing is reported when there is no bank history at all: without stored
 *     transactions we cannot tell "the deposit didn't arrive" from "the bank isn't
 *     connected/synced", and the app works fine without bank sync.
 */
import type { AlertDTO, BankTransactionDTO, IncomeDTO } from "../contracts/api";
import { addDays, dayOfWeek, parseIsoDate } from "./dates";
import { formatCents } from "./money";
import { generateOccurrences, type Schedule } from "./recurrence";
import { nameTokens, namesOverlap, sharesLeadWord, within } from "./recurring";

/** Days after an expected payday we wait before declaring it missing (no alert on the day it is due). */
export const MISSED_PAYCHECK_GRACE_DAYS = 3;
/** Expected paydays older than this many days (counting today) are no longer watched. */
export const MISSED_PAYCHECK_LOOKBACK_DAYS = 14;
/** A deposit dated within this many days before or after the expected payday counts as that paycheck. */
export const MISSED_PAYCHECK_MATCH_DAYS = 3;
/** Amount tolerance (fraction of the larger amount) when the deposit's name overlaps the income name. */
export const MISSED_PAYCHECK_NAME_AMOUNT_TOLERANCE = 0.25;
/** Amount tolerance when only the leading word of the names match (weaker evidence, so tighter). */
export const MISSED_PAYCHECK_LEAD_AMOUNT_TOLERANCE = 0.1;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Friday, Oct 16" — a fixed past-tense label, since a missed payday is always in the past. */
function friendlyDate(date: string): string {
  const { month, day } = parseIsoDate(date);
  return `${WEEKDAYS[dayOfWeek(date)]}, ${MONTHS[month - 1]} ${day}`;
}

export interface MissingPaycheckInput {
  incomes: Pick<IncomeDTO, "id" | "name" | "amountCents" | "frequency" | "anchorDate" | "endDate" | "active">[];
  /** Stored transactions of the household's BANK (depository) accounts, signed like the bank (money in positive). The caller scopes to BANK accounts: credit/loan/other accounts can't receive a paycheck. */
  transactions: Pick<BankTransactionDTO, "date" | "description" | "amountCents">[];
  /** Currency for the notification body. */
  currency: string;
}

interface Deposit {
  date: string;
  description: string;
  amountCents: number;
}

/** True when a positive transaction looks like the expected paycheck for `date` (name and amount both match, dated within ±MATCH_DAYS). */
function isPaycheckMatched(income: { name: string; amountCents: number }, date: string, deposits: Deposit[]): boolean {
  const tokens = nameTokens(income.name);
  const from = addDays(date, -MISSED_PAYCHECK_MATCH_DAYS);
  const to = addDays(date, MISSED_PAYCHECK_MATCH_DAYS);
  return deposits.some((d) => {
    if (d.date < from || d.date > to) return false;
    const theirs = nameTokens(d.description);
    if (theirs.length === 0) return false;
    // Strong name match (one name's words all in the other): be generous on amount.
    if (namesOverlap(tokens, theirs)) return within(d.amountCents, income.amountCents, MISSED_PAYCHECK_NAME_AMOUNT_TOLERANCE);
    // Weaker name match (same leading word): require a much closer amount.
    if (sharesLeadWord(tokens, theirs)) return within(d.amountCents, income.amountCents, MISSED_PAYCHECK_LEAD_AMOUNT_TOLERANCE);
    return false;
  });
}

export function findMissingPaychecks({ incomes, transactions, currency }: MissingPaycheckInput, today: string): AlertDTO[] {
  // Without bank history we cannot distinguish "no deposit" from "no bank sync", so stay quiet.
  if (transactions.length === 0) return [];

  const deposits = transactions.filter((t) => t.amountCents > 0);
  // An occurrence is "missing" only while it is late by the grace period but not yet old.
  const lookbackStart = addDays(today, -MISSED_PAYCHECK_LOOKBACK_DAYS);
  const graceEnd = addDays(today, -MISSED_PAYCHECK_GRACE_DAYS);

  const alerts: AlertDTO[] = [];
  for (const income of incomes) {
    if (!income.active) continue;
    if (income.frequency !== "WEEKLY" && income.frequency !== "BIWEEKLY") continue;
    if (nameTokens(income.name).length === 0) continue;

    const schedule: Schedule = { frequency: income.frequency, anchorDate: income.anchorDate, endDate: income.endDate };
    for (const date of generateOccurrences(schedule, lookbackStart, graceEnd)) {
      if (isPaycheckMatched(income, date, deposits)) continue;
      alerts.push({
        key: `missed-paycheck:${income.id}:${date}`,
        kind: "MISSED_PAYCHECK",
        title: `${income.name} may be missing`,
        body: `No ${formatCents(income.amountCents, { currency })} deposit was seen for the expected payday on ${friendlyDate(date)}.`,
        expiresOn: addDays(date, MISSED_PAYCHECK_LOOKBACK_DAYS),
      });
    }
  }
  return alerts;
}
