/**
 * Client-side calendar-grid helpers on YYYY-MM-DD strings (UTC based, so the
 * local timezone and DST can never shift a date). These only lay out the grid;
 * they never compute money.
 */
import { format } from "date-fns";

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const dt = toUtc(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

export function startOfWeek(date: string, weekStartsOn: number): string {
  const diff = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** First day of the month `months` away from the month containing `date`. */
export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  return fromUtc(dt);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Browser-local "today" as YYYY-MM-DD. */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Browser-local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDateOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Formats a YYYY-MM-DD date with a date-fns pattern, without timezone drift. */
export function fmtDate(date: string, pattern: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return format(new Date(y, m - 1, d), pattern);
}

/** "Mar 4, 2025" */
export const fmtShort = (date: string) => fmtDate(date, "MMM d, yyyy");
/** "Tue, Mar 4" */
export const fmtDayShort = (date: string) => fmtDate(date, "EEE, MMM d");
/** "Tuesday March 4" */
export const fmtDayLong = (date: string) => fmtDate(date, "EEEE MMMM d");

/** "Mar 2 – Mar 8" (adds the year to the end when the range crosses years) */
export function fmtRange(from: string, to: string): string {
  if (from === to) return fmtShort(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${fmtShort(from)} – ${fmtShort(to)}`;
  return `${fmtDate(from, "MMM d")} – ${fmtDate(to, "MMM d, yyyy")}`;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
