/**
 * Anchored recurrence generation (CONVENTIONS section 4).
 *
 * Occurrence k is always computed from the anchor (never from the previous
 * occurrence), so month-end clamping cannot drift. Generation jumps straight to
 * the first candidate index near `from`, so far-past anchors stay cheap.
 */
import type { BillFrequency, IncomeFrequency } from "../contracts/api";
import { addDays, addMonthsClamped, diffDays, maxDate, minDate, parseIsoDate } from "./dates";

export interface Schedule {
  frequency: IncomeFrequency | BillFrequency;
  anchorDate: string;
  endDate: string | null;
}

const DAY_STEPS: Partial<Record<Schedule["frequency"], number>> = { WEEKLY: 7, BIWEEKLY: 14 };
const MONTH_STEPS: Partial<Record<Schedule["frequency"], number>> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

/** Occurrence dates of `schedule` within [from, to] (inclusive), ascending. */
export function generateOccurrences(schedule: Schedule, from: string, to: string): string[] {
  const { frequency, anchorDate } = schedule;

  // ONE_TIME: the anchor only; endDate is ignored.
  if (frequency === "ONE_TIME") {
    return anchorDate >= from && anchorDate <= to ? [anchorDate] : [];
  }

  // Nothing before the anchor; endDate is inclusive.
  const lo = maxDate(from, anchorDate);
  const hi = schedule.endDate ? minDate(to, schedule.endDate) : to;
  if (lo > hi) return [];

  const daySteps = DAY_STEPS[frequency];
  if (daySteps) return generateDayStepped(anchorDate, daySteps, lo, hi);

  const monthSteps = MONTH_STEPS[frequency];
  if (monthSteps) return generateMonthStepped(anchorDate, monthSteps, lo, hi);

  throw new Error(`Unknown frequency: ${String(frequency)}`);
}

/** anchor + step*k days. Starts at the first k with a date >= lo. */
function generateDayStepped(anchor: string, step: number, lo: string, hi: string): string[] {
  const out: string[] = [];
  let k = Math.max(0, Math.ceil(diffDays(anchor, lo) / step));
  for (let date = addDays(anchor, step * k); date <= hi; date = addDays(anchor, step * ++k)) {
    out.push(date);
  }
  return out;
}

/** (anchor month + step*k) on min(anchorDay, daysInMonth). Starts near lo's month. */
function generateMonthStepped(anchor: string, step: number, lo: string, hi: string): string[] {
  const a = parseIsoDate(anchor);
  const l = parseIsoDate(lo);
  const monthsToLo = (l.year - a.year) * 12 + (l.month - a.month);
  // floor() lands on the occurrence in or before lo's month; earlier dates are skipped below.
  let k = Math.max(0, Math.floor(monthsToLo / step));
  const out: string[] = [];
  for (let date = addMonthsClamped(anchor, step * k); date <= hi; date = addMonthsClamped(anchor, step * ++k)) {
    if (date >= lo) out.push(date);
  }
  return out;
}

/** True when `date` is one of the schedule's occurrences (ignores the active flag). */
export function isScheduledOn(schedule: Schedule, date: string): boolean {
  return generateOccurrences(schedule, date, date).length === 1;
}
