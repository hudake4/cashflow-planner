/**
 * Suggested amount for a variable bill, from the stored bank history (CONVENTIONS section 15).
 * Pure: no Prisma, no clock (today is passed in), no I/O.
 *
 * Money-out transactions whose description matches the bill's name are summed per billing period
 * (a week, two weeks, or a calendar month). The suggestion is the average of the latest complete
 * periods, or, when the history reaches back far enough to hold the same month of an earlier year,
 * the average of that month. It is only a suggestion: the caller shows it and the user decides.
 */
import type { BillEstimateReason, BillEstimateValueDTO, BillFrequency } from "../contracts/api";
import { addDays, daysInMonth, diffDays, parseIsoDate } from "./dates";
import { nameTokens, namesOverlap, type ScanTransaction } from "./recurring";

/** Fewest complete periods that make an average worth showing. */
export const MIN_PERIODS = 2;
/** How many of the latest complete periods the rolling average covers. */
export const ROLLING_PERIODS = 4;
/** With at least 3 periods, one that is under half or over double the median is left out (a refund, a catch-up payment). */
const OUTLIER_FACTOR = 2;
const MAX_CENTS = 1_000_000_000;

const PERIOD_DAYS: Partial<Record<BillFrequency, number>> = { WEEKLY: 7, BIWEEKLY: 14 };

export interface EstimateInput {
  billName: string;
  frequency: BillFrequency;
  anchorDate: string;
  /** The occurrence being estimated; its calendar month picks the season. */
  dueDate: string;
  /** Settled bank transactions, signed like the bank. Other households' or pending rows must be filtered out by the caller. */
  transactions: ScanTransaction[];
  /** Server-local calendar date. */
  today: string;
  /** Oldest date the bank history covers; a period that starts before it may be incomplete. */
  historyStart: string;
}

export type EstimateResult =
  | { estimate: BillEstimateValueDTO; reason: null }
  | { estimate: null; reason: Exclude<BillEstimateReason, "NO_BANK_DATA"> };

interface Period {
  start: string;
  end: string;
  totalCents: number;
  firstDate: string;
  lastDate: string;
}

function periodOf(date: string, frequency: BillFrequency, anchorDate: string): { key: string; start: string; end: string } {
  const step = PERIOD_DAYS[frequency];
  if (step) {
    const index = Math.floor(diffDays(anchorDate, date) / step);
    const start = addDays(anchorDate, index * step);
    return { key: start, start, end: addDays(start, step - 1) };
  }
  const { year, month } = parseIsoDate(date);
  const key = date.slice(0, 7);
  return { key, start: `${key}-01`, end: `${key}-${String(daysInMonth(year, month)).padStart(2, "0")}` };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(periods: Period[], method: BillEstimateValueDTO["method"]): BillEstimateValueDTO {
  const total = periods.reduce((sum, p) => sum + p.totalCents, 0);
  return {
    amountCents: Math.min(MAX_CENTS, Math.max(1, Math.round(total / periods.length))),
    method,
    periodCount: periods.length,
    firstDate: periods.map((p) => p.firstDate).sort()[0],
    lastDate: periods.map((p) => p.lastDate).sort().reverse()[0],
  };
}

export function estimateBillAmount(input: EstimateInput): EstimateResult {
  const { billName, frequency, anchorDate, dueDate, transactions, today, historyStart } = input;
  if (frequency !== "WEEKLY" && frequency !== "BIWEEKLY" && frequency !== "MONTHLY") {
    return { estimate: null, reason: "UNSUPPORTED_FREQUENCY" };
  }

  const billTokens = nameTokens(billName);
  const periods = new Map<string, Period>();
  for (const t of transactions) {
    if (t.amountCents >= 0 || t.date > today || !namesOverlap(billTokens, nameTokens(t.description))) continue;
    const { key, start, end } = periodOf(t.date, frequency, anchorDate);
    const period = periods.get(key) ?? { start, end, totalCents: 0, firstDate: t.date, lastDate: t.date };
    period.totalCents += -t.amountCents;
    if (t.date < period.firstDate) period.firstDate = t.date;
    if (t.date > period.lastDate) period.lastDate = t.date;
    periods.set(key, period);
  }
  if (periods.size === 0) return { estimate: null, reason: "NO_MATCHES" };

  // A period still in progress, or cut off by the start of the history, would understate the bill.
  const complete = [...periods.values()].filter((p) => p.start >= historyStart && p.end < today).sort((a, b) => (a.start < b.start ? -1 : 1));

  // Seasonal: the same calendar month in an earlier year (only reachable if history is kept longer than 89 days).
  if (frequency === "MONTHLY") {
    const dueMonth = dueDate.slice(5, 7);
    const dueYear = dueDate.slice(0, 4);
    const sameMonth = complete.filter((p) => p.start.slice(5, 7) === dueMonth && p.start.slice(0, 4) < dueYear);
    if (sameMonth.length > 0) return { estimate: summarize(sameMonth, "SEASONAL"), reason: null };
  }

  const recent = complete.slice(-ROLLING_PERIODS);
  if (recent.length < MIN_PERIODS) return { estimate: null, reason: "TOO_FEW_PERIODS" };

  let used = recent;
  if (recent.length >= 3) {
    const mid = median(recent.map((p) => p.totalCents).sort((a, b) => a - b));
    const typical = recent.filter((p) => p.totalCents * OUTLIER_FACTOR >= mid && p.totalCents <= mid * OUTLIER_FACTOR);
    if (typical.length >= MIN_PERIODS) used = typical;
  }
  return { estimate: summarize(used, "ROLLING"), reason: null };
}
