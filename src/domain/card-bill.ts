/**
 * Credit-card bill estimator (CONVENTIONS: issue #61). Pure: no Prisma, no clock (today is
 * passed in), no I/O. Money is integer cents, positive magnitudes for bills.
 *
 * Projected statement balance = amount owed now (the synced card balance) + recurring charges
 * expected before the statement's closing date + an optional variable-spend estimate. The closing
 * date (the next monthly occurrence of the user's closing date) decides which charges land on this
 * statement and which on the next. The result is an estimate the user can overwrite.
 */
import { addMonthsClamped, daysInMonth, formatIsoDate, parseIsoDate } from "./dates";

export interface CardBillCharge {
  /** Positive magnitude in cents. */
  amountCents: number;
  /** YYYY-MM-DD date the charge is expected to land. */
  date: string;
}

export interface CardBillEstimateInput {
  /** Synced card balance, signed like the bank. The amount owed is taken as its absolute value. */
  balanceCents: number;
  /** Any YYYY-MM-DD the statement closes on. Cards bill monthly, so it anchors the cycle: only its day of month matters. */
  statementClosingAnchor: string;
  /** Any YYYY-MM-DD the payment is due on, anchoring the cycle the same way. */
  paymentDueAnchor: string;
  /** Server-local calendar date YYYY-MM-DD. */
  today: string;
  /** Recurring charges detected on the card, with their expected dates. */
  charges?: CardBillCharge[];
  /** Optional extra variable spend the user expects before closing. */
  variableSpendCents?: number;
  /** APR in basis points (100 = 1.00%). When present a minimum payment is approximated. */
  aprBasisPoints?: number | null;
  /** Optional issuer rule label. When present a minimum payment is approximated. */
  minimumPaymentRule?: string | null;
}

export interface CardBillEstimate {
  /** YYYY-MM-DD closing date of the statement being estimated. */
  closingDate: string;
  /** YYYY-MM-DD payment due date. */
  dueDate: string;
  /** Current amount owed (absolute balance). */
  currentOwedCents: number;
  /** Recurring charges expected on or before the closing date. */
  recurringChargesCents: number;
  /** Variable spend estimate included. */
  variableSpendCents: number;
  /** Projected bill (positive magnitude). */
  projectedBillCents: number;
  /** Approximate minimum payment, or null when paying in full / no APR. */
  minimumPaymentCents: number | null;
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/** The next date on or after `today` that falls on `day` of the month (clamped to short months). */
export function nextDayOfMonth(today: string, day: number): string {
  const { year, month } = parseIsoDate(today);
  const thisMonth = formatIsoDate(year, month, clampDay(year, month, day));
  if (thisMonth >= today) return thisMonth;
  // next month
  const next = addMonthsClamped(formatIsoDate(year, month, 1), 1);
  const { year: ny, month: nm } = parseIsoDate(next);
  return formatIsoDate(ny, nm, clampDay(ny, nm, day));
}

/** The payment due date for a statement that closes on `closingDate`. */
export function paymentDueDate(closingDate: string, dueDay: number): string {
  const { year, month } = parseIsoDate(closingDate);
  const sameMonthDay = clampDay(year, month, dueDay);
  const sameMonth = formatIsoDate(year, month, sameMonthDay);
  if (sameMonth > closingDate) return sameMonth;
  const next = addMonthsClamped(formatIsoDate(year, month, 1), 1);
  const { year: ny, month: nm } = parseIsoDate(next);
  return formatIsoDate(ny, nm, clampDay(ny, nm, dueDay));
}

/**
 * Rolls a monthly anchor date forward to its next occurrence on or after `today`: the anchor's day of
 * month, clamped to short months (31 gives Feb 28/29), so a date entered months ago still works.
 */
export function nextMonthlyDate(anchor: string, today: string): string {
  return nextDayOfMonth(today, parseIsoDate(anchor).day);
}

export function estimateCardBill(input: CardBillEstimateInput): CardBillEstimate {
  const currentOwedCents = Math.abs(input.balanceCents);
  const closingDate = nextMonthlyDate(input.statementClosingAnchor, input.today);
  const dueDate = paymentDueDate(closingDate, parseIsoDate(input.paymentDueAnchor).day);

  const recurringChargesCents = (input.charges ?? [])
    .filter((c) => c.date <= closingDate)
    .reduce((s, c) => s + (c.amountCents > 0 ? c.amountCents : -c.amountCents), 0);

  const variableSpendCents = input.variableSpendCents ?? 0;

  const projectedBillCents = currentOwedCents + recurringChargesCents + variableSpendCents;

  let minimumPaymentCents: number | null = null;
  if (input.aprBasisPoints != null || input.minimumPaymentRule) {
    // Approximation: 2% of the projected bill, floor of $25.
    const twoPct = Math.round(projectedBillCents * 0.02);
    minimumPaymentCents = Math.max(2500, twoPct);
    if (minimumPaymentCents > projectedBillCents) minimumPaymentCents = projectedBillCents;
  }

  return {
    closingDate,
    dueDate,
    currentOwedCents,
    recurringChargesCents,
    variableSpendCents,
    projectedBillCents,
    minimumPaymentCents,
  };
}