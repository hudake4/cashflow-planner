/**
 * Calendar-date helpers for "YYYY-MM-DD" strings (CONVENTIONS section 2).
 *
 * All math is done on UTC midnight timestamps so local timezones and DST can
 * never shift a date. Pure functions; the only clock access is `todayLocal`,
 * which takes an optional `now` for testability.
 */

const MS_PER_DAY = 86_400_000;

/** Parses "YYYY-MM-DD" into its numeric parts. Throws on malformed input. */
export function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Formats numeric parts as "YYYY-MM-DD". `month` is 1-12. */
export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** UTC-midnight epoch milliseconds for a date string. */
function toUtcMs(date: string): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms);
  return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Number of days in a month (month is 1-12). Handles leap years. */
export function daysInMonth(year: number, month1to12: number): number {
  // Day 0 of the following month is the last day of this month.
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Adds `months` to the anchor's month and uses day = min(anchorDay, daysInMonth)
 * (CONVENTIONS section 4, month-end policy). Always computed from the anchor, so
 * Jan 31 + 1 = Feb 28/29 and Jan 31 + 2 = Mar 31 (no drift).
 */
export function addMonthsClamped(anchor: string, months: number): string {
  const { year, month, day } = parseIsoDate(anchor);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return formatIsoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** `to - from` in whole days (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Day of week, 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** The first day of the week containing `date`, for weeks starting on `weekStartsOn` (0-6). */
export function startOfWeek(date: string, weekStartsOn: number): string {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

/** Every date from `from` to `to`, inclusive. Empty when `from > to`. */
export function eachDay(from: string, to: string): string[] {
  const count = diffDays(from, to);
  const out: string[] = [];
  for (let i = 0; i <= count; i++) out.push(addDays(from, i));
  return out;
}

/** The machine-local calendar date (CONVENTIONS section 2: "today" is server-local). */
// The one place the domain touches the clock; callers pass `now` in tests.
// eslint-disable-next-line no-restricted-syntax
export function todayLocal(now: Date = new Date()): string {
  return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// "YYYY-MM-DD" strings compare correctly as plain strings.
export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Clamps `date` into [lo, hi]. */
export function clampDate(date: string, lo: string, hi: string): string {
  return minDate(maxDate(date, lo), hi);
}
