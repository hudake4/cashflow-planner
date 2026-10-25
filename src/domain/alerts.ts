/**
 * Alerts behind the desktop notifications (CONVENTIONS section 14): a projected negative
 * balance and bills that are due soon. Pure: built from a finished projection, and
 * `today` is passed in. Remembering which alerts were already shown is the client's job.
 */
import type { AlertDTO, ProjectionResponse } from "../contracts/api";
import { addDays, clampDate, dayOfWeek, diffDays, maxDate, minDate, parseIsoDate } from "./dates";
import { formatCents } from "./money";

/** A projected negative balance is reported when it starts within this many days (today included). */
export const LOW_BALANCE_LOOKAHEAD_DAYS = 14;
/** A bill is reported once it is due within this many days (0 = due today). */
export const BILL_LEAD_DAYS = 3;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Friday, Nov 6" */
function longDate(date: string): string {
  const { month, day } = parseIsoDate(date);
  return `${WEEKDAYS[dayOfWeek(date)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "today", "tomorrow", a weekday within the coming week, else "Nov 20". */
function whenLabel(reference: string, date: string): string {
  const away = diffDays(reference, date);
  if (away <= 0) return "today";
  if (away === 1) return "tomorrow";
  if (away <= 6) return WEEKDAYS[dayOfWeek(date)];
  const { month, day } = parseIsoDate(date);
  return `${MONTHS[month - 1]} ${day}`;
}

export function buildAlerts(projection: ProjectionResponse, today: string): AlertDTO[] {
  const { startDate, endDate } = projection.window;
  // Same reference date as the dashboard (CONVENTIONS section 8); a start date long past shows nothing.
  if (today > endDate) return [];
  const reference = clampDate(maxDate(today, startDate), startDate, endDate);
  const alerts: AlertDTO[] = [];

  // Balance: the first end-of-day balance below zero that falls within the lookahead.
  const days = projection.days;
  const lookaheadEnd = minDate(addDays(reference, LOW_BALANCE_LOOKAHEAD_DAYS - 1), endDate);
  const firstNegative = days.findIndex((d) => d.date >= reference && d.date <= lookaheadEnd && d.closingBalanceCents < 0);
  if (firstNegative >= 0) {
    // A run that began before today keeps the key of its first day, so it is announced once, not every day.
    let runStart = firstNegative;
    while (runStart > 0 && days[runStart - 1].closingBalanceCents < 0) runStart--;
    let runEnd = firstNegative;
    while (runEnd < days.length - 1 && days[runEnd + 1].closingBalanceCents < 0) runEnd++;
    const first = days[firstNegative];
    const alreadyNegative = runStart < firstNegative || first.openingBalanceCents < 0;
    const money = formatCents(first.closingBalanceCents, { currency: projection.currency });
    alerts.push({
      key: `low-balance:${days[runStart].date}`,
      kind: "LOW_BALANCE",
      title: alreadyNegative ? "Balance is negative" : `Balance goes negative ${whenLabel(reference, first.date)}`,
      body: `Projected balance is ${money} at the end of ${longDate(first.date)}.`,
      expiresOn: days[runEnd].date,
    });
  }

  // Bills: due within the lead time, and not marked paid (skipped ones are not included).
  const billsEnd = addDays(reference, BILL_LEAD_DAYS);
  for (const e of projection.events) {
    if (e.kind !== "BILL" || !e.included || e.status === "PAID") continue;
    if (e.date < reference || e.date > billsEnd) continue;
    const away = diffDays(reference, e.date);
    alerts.push({
      key: `bill:${e.sourceId}:${e.date}`,
      kind: "BILL_DUE",
      title: `${e.name} due ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`,
      body: `${formatCents(e.amountCents, { currency: projection.currency })} on ${longDate(e.date)}.`,
      expiresOn: e.date,
    });
  }
  return alerts;
}
