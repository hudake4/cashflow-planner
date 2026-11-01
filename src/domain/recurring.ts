/**
 * Recurring-payment detection (CONVENTIONS section 12). Pure: no Prisma, no clock (today is
 * passed in), no I/O.
 *
 * Input is the stored bank history (HISTORY_DAYS, over a year once it has built up). Only weekly
 * (3+ times), every 2 weeks (3+ times) and monthly (2+ times) cadences are recognised; quarterly and
 * yearly payments are not detected.
 *
 * Transactions are grouped by direction (money in / money out) and a normalised merchant name,
 * then each group is tested against the cadences. A group that matches becomes a suggestion with
 * the next expected date, so the user never types a date or a frequency.
 */
import type {
  BillFrequency,
  IncomeFrequency,
  LedgerEventKind,
  RecurringFrequency,
  RecurringSuggestionDTO,
} from "../contracts/api";
import { addDays, daysInMonth, diffDays, formatIsoDate, maxDate, parseIsoDate } from "./dates";
import { generateOccurrences } from "./recurrence";

export interface ScanTransaction {
  date: string;
  description: string;
  /** Signed like the bank: money in positive, money out negative. */
  amountCents: number;
  /** Optional account id, used to run the scan for a single account. */
  accountId?: string;
}

/** The part of an existing bill or income source that decides whether a suggestion is a duplicate. */
export interface ExistingSchedule {
  name: string;
  amountCents: number;
  frequency: IncomeFrequency | BillFrequency;
  anchorDate: string;
  endDate: string | null;
}

export interface DetectInput {
  transactions: ScanTransaction[];
  incomes: ExistingSchedule[];
  bills: ExistingSchedule[];
  /** Server-local calendar date. */
  today: string;
  /** Optional account id: only transactions for this account are considered. */
  accountId?: string;
}

interface Cadence {
  /** Allowed gap, in days, between consecutive occurrences. */
  minGap: number;
  maxGap: number;
  /** Fewest occurrences that count as a pattern. */
  minCount: number;
  /** If the last occurrence is older than this the payment has probably stopped. */
  maxIdleDays: number;
  /** Largest allowed deviation of any amount from the median, as a fraction of the median. */
  amountTolerance: (count: number) => number;
}

// Weekly and biweekly need three sightings and near-identical amounts: two charges a week apart are
// usually a coincidence (groceries). Monthly bills may vary (utilities) once they have been seen 3 times.
const CADENCES: Record<RecurringFrequency, Cadence> = {
  WEEKLY: { minGap: 6, maxGap: 8, minCount: 3, maxIdleDays: 14, amountTolerance: () => 0.15 },
  BIWEEKLY: { minGap: 13, maxGap: 15, minCount: 3, maxIdleDays: 28, amountTolerance: () => 0.15 },
  MONTHLY: { minGap: 26, maxGap: 35, minCount: 2, maxIdleDays: 45, amountTolerance: (n) => (n >= 3 ? 0.4 : 0.1) },
};
const CADENCE_ORDER: RecurringFrequency[] = ["WEEKLY", "BIWEEKLY", "MONTHLY"];

/** Amounts further apart than this (relative to the median) are flagged as "varies". */
const VARIES_THRESHOLD = 0.02;
const MAX_NAME_LENGTH = 80;
const KEY_TOKENS = 3;

/** Bank boilerplate that says how a payment was made, not who it went to. */
const NOISE = new Set([
  "pos", "debit", "credit", "card", "purchase", "recurring", "ach", "web", "ppd", "ccd", "online", "checkcard",
  "visa", "mastercard", "withdrawal", "direct", "dep", "deposit", "autopay", "payment", "pmt", "bill", "transaction",
  // "DDA PUR AP <merchant>": debit-card purchase prefix. Left in, the first 3 words ("dda pur ap") put every purchase in one group.
  "dda", "pur", "ap",
]);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Words of a bank description with reference numbers and boilerplate removed ("POS DEBIT NETFLIX.COM 1234" -> netflix, com). */
export function nameTokens(description: string): string[] {
  const words = description
    .toLowerCase()
    .replace(/['’&]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !/\d/.test(w));
  const meaningful = words.filter((w) => !NOISE.has(w));
  return meaningful.length > 0 ? meaningful : words;
}

export function displayName(description: string): string {
  const kept = description
    .split(/\s+/)
    .filter((w) => {
      const bare = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      return bare.length >= 2 && !/\d/.test(bare) && !NOISE.has(bare);
    })
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return (kept.length > 0 ? kept.join(" ") : description.trim()).slice(0, MAX_NAME_LENGTH);
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Largest |amount - median| as a fraction of the median. */
function amountSpread(amounts: number[]): number {
  const m = median(amounts);
  return Math.max(...amounts.map((a) => Math.abs(a - m))) / m;
}

function matchCadence(dates: string[], amounts: number[], today: string): { frequency: RecurringFrequency; spread: number } | null {
  const spread = amountSpread(amounts);
  const idle = diffDays(dates[dates.length - 1], today);
  for (const frequency of CADENCE_ORDER) {
    const c = CADENCES[frequency];
    if (dates.length < c.minCount || idle > c.maxIdleDays || spread > c.amountTolerance(dates.length)) continue;
    const gapsFit = dates.slice(1).every((d, i) => {
      const gap = diffDays(dates[i], d);
      return gap >= c.minGap && gap <= c.maxGap;
    });
    if (gapsFit) return { frequency, spread };
  }
  return null;
}

/** The day of the month the payment usually lands on. A clamped month-end (Feb 28) doesn't override a 31st. */
function typicalDay(dates: string[]): number {
  const days = dates.map((d) => parseIsoDate(d).day);
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
  const best = Math.max(...counts.values());
  const tied = new Set([...counts].filter(([, n]) => n === best).map(([d]) => d));
  const latest = [...days].reverse().find((d) => tied.has(d)) as number;
  const { year, month, day } = parseIsoDate(dates[dates.length - 1]);
  const lastIsMonthEnd = day === daysInMonth(year, month);
  return lastIsMonthEnd && tied.size > 1 ? Math.max(...tied) : latest;
}

/** First expected date that is on or after today and after the last sighting. */
function nextDate(frequency: RecurringFrequency, dates: string[], today: string): string {
  const last = dates[dates.length - 1];
  const earliest = maxDate(today, addDays(last, 1));
  if (frequency !== "MONTHLY") {
    const step = frequency === "WEEKLY" ? 7 : 14;
    return addDays(last, step * Math.max(1, Math.ceil(diffDays(last, earliest) / step)));
  }
  const day = typicalDay(dates);
  const { year, month } = parseIsoDate(last);
  for (let m = 0; ; m++) {
    const index = year * 12 + (month - 1) + m;
    const y = Math.floor(index / 12);
    const mo = index - y * 12 + 1;
    const candidate = formatIsoDate(y, mo, Math.min(day, daysInMonth(y, mo)));
    if (candidate >= earliest) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Already tracked?
// ---------------------------------------------------------------------------

/** True when two amounts are within `fraction` of the larger one. */
export const within = (a: number, b: number, fraction: number) => Math.abs(a - b) <= Math.max(a, b) * fraction;
const isSubset = (small: string[], big: string[]) => small.length > 0 && small.every((t) => big.includes(t));

/** One name's words (see `nameTokens`) are all in the other: "Netflix" and "NETFLIX.COM" are the same merchant. */
export const namesOverlap = (a: string[], b: string[]) => isSubset(a, b) || isSubset(b, a);

/** Same first word of 5+ letters: "Netflix Premium" and "NETFLIX.COM". Weaker than `namesOverlap`; callers pair it with an amount check. */
export const sharesLeadWord = (a: string[], b: string[]) => a[0] !== undefined && a[0] === b[0] && a[0].length >= 5;

function isTracked(
  tokens: string[],
  amountCents: number,
  frequency: RecurringFrequency,
  next: string,
  existing: ExistingSchedule[],
  today: string,
): boolean {
  return existing.some((e) => {
    if (e.frequency === "ONE_TIME" || (e.endDate && e.endDate < today)) return false;
    const theirs = nameTokens(e.name);
    if (namesOverlap(theirs, tokens)) return true;
    // "Netflix Premium" already tracked and the bank says "NETFLIX.COM": same first word, similar amount.
    if (sharesLeadWord(theirs, tokens) && within(e.amountCents, amountCents, 0.25)) return true;
    // Named differently ("Rent" vs a landlord's name) but the same amount on the same schedule.
    if (e.frequency !== frequency || !within(e.amountCents, amountCents, 0.03)) return false;
    const slack = frequency === "MONTHLY" ? 3 : 1;
    const schedule = { frequency: e.frequency, anchorDate: e.anchorDate, endDate: e.endDate };
    return generateOccurrences(schedule, addDays(next, -slack), addDays(next, slack)).length > 0;
  });
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface Group {
  kind: LedgerEventKind;
  key: string;
  tokens: string[];
  description: string;
  /** Total magnitude per date (several charges on one day are one sighting). */
  byDate: Map<string, number>;
}

export function detectRecurring({ transactions, incomes, bills, today, accountId }: DetectInput): RecurringSuggestionDTO[] {
  const scoped = accountId ? transactions.filter((t) => t.accountId === accountId) : transactions;
  const groups = new Map<string, Group>();
  const ordered = [...scoped].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const t of ordered) {
    if (t.amountCents === 0 || t.date > today) continue;
    const tokens = nameTokens(t.description);
    if (tokens.length === 0) continue;
    const kind: LedgerEventKind = t.amountCents > 0 ? "INCOME" : "BILL";
    const key = `${kind}:${tokens.slice(0, KEY_TOKENS).join(" ")}`;
    // Later transactions overwrite tokens/description so the newest wording wins.
    const group = groups.get(key) ?? { kind, key, tokens, description: t.description, byDate: new Map() };
    group.tokens = tokens;
    group.description = t.description;
    group.byDate.set(t.date, (group.byDate.get(t.date) ?? 0) + Math.abs(t.amountCents));
    groups.set(key, group);
  }

  const suggestions: RecurringSuggestionDTO[] = [];
  for (const group of groups.values()) {
    const dates = [...group.byDate.keys()].sort();
    const amounts = dates.map((d) => group.byDate.get(d) as number);
    const match = matchCadence(dates, amounts, today);
    if (!match) continue;

    const amountCents = amounts[amounts.length - 1];
    const next = nextDate(match.frequency, dates, today);
    const existing = group.kind === "INCOME" ? incomes : bills;
    if (isTracked(group.tokens, amountCents, match.frequency, next, existing, today)) continue;

    suggestions.push({
      key: group.key,
      kind: group.kind,
      name: displayName(group.description),
      amountCents,
      frequency: match.frequency,
      nextDate: next,
      occurrences: dates.length,
      seenDates: dates,
      amountVaries: match.spread > VARIES_THRESHOLD,
    });
  }

  return suggestions.sort(
    (a, b) =>
      (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0) ||
      (a.kind === b.kind ? 0 : a.kind === "INCOME" ? -1 : 1) ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key),
  );
}
