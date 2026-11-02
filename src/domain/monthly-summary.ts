/**
 * Monthly summary report (CONVENTIONS section 18). Pure: it reads a `ProjectionResponse`
 * already sliced to the month and regroups its numbers. Balances and totals are the
 * engine's own, never recomputed here.
 */
import type { LedgerEvent, ProjectionResponse, ProjectionTotals, WeekSummary } from "../contracts/api";
import { daysInMonth, formatIsoDate, parseIsoDate } from "./dates";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** First and last date of a "YYYY-MM" month. */
export function monthBounds(month: string): { from: string; to: string } {
  const { year, month: m } = parseIsoDate(`${month}-01`);
  return { from: formatIsoDate(year, m, 1), to: formatIsoDate(year, m, daysInMonth(year, m)) };
}

/** "October 2026" */
export function monthLabel(month: string): string {
  const { year, month: m } = parseIsoDate(`${month}-01`);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

export interface SummaryGroup {
  /** Income source or bill category; null is a bill with no category. */
  label: string | null;
  amountCents: number;
  count: number;
}

export interface MonthlySummary {
  month: string;
  label: string;
  currency: string;
  /** Dates actually covered: the month cut to the projection window. */
  range: { from: string; to: string };
  /** True when the range does not span the whole month. */
  partial: boolean;
  totals: ProjectionTotals;
  /** Skipped bills are listed in the register but counted nowhere above. */
  skippedBillCount: number;
  skippedBillsCents: number;
  incomeBySource: SummaryGroup[];
  billsByCategory: SummaryGroup[];
  weeks: WeekSummary[];
}

/**
 * `projection` must be the engine's slice for the month (clamped to the window by the
 * engine). Income is grouped by source name and bills by category; both lists are
 * largest first, then by label, and leave out skipped events.
 */
export function buildMonthlySummary(month: string, projection: ProjectionResponse): MonthlySummary {
  const bounds = monthBounds(month);
  const counted = projection.events.filter((e) => e.included);
  const skipped = projection.events.filter((e) => !e.included);
  return {
    month,
    label: monthLabel(month),
    currency: projection.currency,
    range: projection.range,
    partial: projection.range.from !== bounds.from || projection.range.to !== bounds.to,
    totals: projection.totals,
    skippedBillCount: skipped.length,
    skippedBillsCents: skipped.reduce((sum, e) => sum + e.amountCents, 0),
    incomeBySource: groupBy(
      counted.filter((e) => e.kind === "INCOME"),
      (e) => e.name,
    ),
    billsByCategory: groupBy(
      counted.filter((e) => e.kind === "BILL"),
      (e) => e.category?.trim() || null,
    ),
    weeks: projection.weeks,
  };
}

function groupBy(events: LedgerEvent[], labelOf: (e: LedgerEvent) => string | null): SummaryGroup[] {
  const groups = new Map<string | null, SummaryGroup>();
  for (const e of events) {
    const label = labelOf(e);
    const group = groups.get(label) ?? { label, amountCents: 0, count: 0 };
    group.amountCents += e.amountCents;
    group.count += 1;
    groups.set(label, group);
  }
  // Code-unit comparison, like the ledger order: the same output on every machine.
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents || compareLabels(a.label ?? "", b.label ?? ""));
}

function compareLabels(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
