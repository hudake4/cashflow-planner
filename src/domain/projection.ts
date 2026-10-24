/**
 * The single cash-flow projection engine (CONVENTIONS sections 3-7, 9).
 *
 * Always computes from `projectionStartDate` forward, then slices the requested
 * range, so every view sees identical balances. Pure: no I/O, no clock.
 */
import type {
  BillDTO,
  BillOccurrenceDTO,
  DaySummary,
  IncomeDTO,
  LedgerEvent,
  ProjectionResponse,
  ProjectionTotals,
  SettingsDTO,
  WeekSummary,
} from "../contracts/api";
import { addDays, clampDate, eachDay, maxDate, minDate, startOfWeek } from "./dates";
import { generateOccurrences } from "./recurrence";

export interface ProjectionInput {
  settings: Pick<SettingsDTO, "startingBalanceCents" | "projectionStartDate" | "forecastDays" | "weekStartsOn" | "currency">;
  incomes: Pick<IncomeDTO, "id" | "name" | "amountCents" | "frequency" | "anchorDate" | "endDate" | "active">[];
  bills: Pick<BillDTO, "id" | "name" | "amountCents" | "frequency" | "anchorDate" | "endDate" | "active" | "category">[];
  occurrences: Pick<BillOccurrenceDTO, "billId" | "dueDate" | "status" | "amountOverrideCents">[];
  from?: string;
  to?: string;
}

/** Furthest date any request may reach: start + 365 days (CONVENTIONS section 3). */
export const MAX_HORIZON_DAYS = 365;

export function projectionWindow(settings: Pick<SettingsDTO, "projectionStartDate" | "forecastDays">) {
  const startDate = settings.projectionStartDate;
  return {
    startDate,
    endDate: addDays(startDate, settings.forecastDays - 1),
    maxEndDate: addDays(startDate, MAX_HORIZON_DAYS),
  };
}

/** Clamps from/to into [start, maxEndDate]; defaults to the full window (section 3). */
export function resolveRange(
  window: ReturnType<typeof projectionWindow>,
  from?: string,
  to?: string,
): { from: string; to: string } {
  const lo = clampDate(from ?? window.startDate, window.startDate, window.maxEndDate);
  const hi = clampDate(to ?? window.endDate, window.startDate, window.maxEndDate);
  // A `from` past the default `to` (e.g. browsing far ahead) yields a one-day range at `from`.
  return { from: lo, to: maxDate(lo, hi) };
}

export function computeProjection(input: ProjectionInput): ProjectionResponse {
  const { settings } = input;
  const window = projectionWindow(settings);
  const range = resolveRange(window, input.from, input.to);

  // Compute everything from the start date through the end of the requested range.
  const ledger = buildLedger(input, window.startDate, range.to);
  const allDays = buildDays(ledger, window.startDate, range.to, settings.startingBalanceCents);

  const days = allDays.filter((d) => d.date >= range.from);
  const inRange = new Set(days.flatMap((d) => d.eventIds));
  const events = ledger.filter((e) => inRange.has(e.id));

  return {
    window,
    range,
    currency: settings.currency,
    weekStartsOn: settings.weekStartsOn,
    startingBalanceCents: settings.startingBalanceCents,
    events,
    days,
    weeks: buildWeeks(days, settings.weekStartsOn),
    totals: buildTotals(days),
  };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

type DraftEvent = Omit<LedgerEvent, "sequence" | "balanceAfterCents">;

function buildLedger(input: ProjectionInput, from: string, to: string): LedgerEvent[] {
  const drafts = [...incomeEvents(input, from, to), ...billEvents(input, from, to)];
  drafts.sort(compareEvents);

  let balance = input.settings.startingBalanceCents;
  return drafts.map((e, sequence) => {
    balance += e.signedAmountCents; // skipped events add 0 and carry the balance
    return { ...e, sequence, balanceAfterCents: balance };
  });
}

function incomeEvents(input: ProjectionInput, from: string, to: string): DraftEvent[] {
  return input.incomes
    .filter((inc) => inc.active)
    .flatMap((inc) =>
      generateOccurrences(inc, from, to).map((date) => ({
        id: `INCOME:${inc.id}:${date}`,
        date,
        kind: "INCOME" as const,
        sourceId: inc.id,
        name: inc.name,
        category: null,
        frequency: inc.frequency,
        amountCents: inc.amountCents,
        signedAmountCents: inc.amountCents,
        status: "SCHEDULED" as const,
        included: true,
        amountOverridden: false,
      })),
    );
}

/**
 * Bill events with recorded statuses applied (section 5): UPCOMING and PAID count
 * once on the due date; SKIPPED stays visible with included=false and 0 effect.
 */
function billEvents(input: ProjectionInput, from: string, to: string): DraftEvent[] {
  const statusByKey = new Map(input.occurrences.map((o) => [`${o.billId}:${o.dueDate}`, o]));
  return input.bills
    .filter((bill) => bill.active)
    .flatMap((bill) =>
      generateOccurrences(bill, from, to).map((date) => {
        const occ = statusByKey.get(`${bill.id}:${date}`);
        const status = occ?.status ?? "UPCOMING";
        const override = occ?.amountOverrideCents ?? null;
        const amountCents = override ?? bill.amountCents;
        const included = status !== "SKIPPED";
        return {
          id: `BILL:${bill.id}:${date}`,
          date,
          kind: "BILL" as const,
          sourceId: bill.id,
          name: bill.name,
          category: bill.category,
          frequency: bill.frequency,
          amountCents,
          signedAmountCents: included ? -amountCents : 0,
          status,
          included,
          amountOverridden: override !== null,
        };
      }),
    );
}

/** Same-day ordering (section 6): date, income before bills, name (ci, then exact), sourceId. */
export function compareEvents(a: Pick<LedgerEvent, "date" | "kind" | "name" | "sourceId">, b: typeof a): number {
  return (
    compareStrings(a.date, b.date) ||
    (a.kind === b.kind ? 0 : a.kind === "INCOME" ? -1 : 1) ||
    compareStrings(a.name.toLowerCase(), b.name.toLowerCase()) ||
    compareStrings(a.name, b.name) ||
    compareStrings(a.sourceId, b.sourceId)
  );
}

// Code-unit comparison: deterministic regardless of the machine's locale.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Days, weeks, totals (section 7)
// ---------------------------------------------------------------------------

function buildDays(ledger: LedgerEvent[], from: string, to: string, openingCents: number): DaySummary[] {
  const byDate = new Map<string, LedgerEvent[]>();
  for (const e of ledger) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  let opening = openingCents;
  return eachDay(from, to).map((date) => {
    const events = byDate.get(date) ?? [];
    const incomeCents = sumWhere(events, (e) => e.included && e.kind === "INCOME");
    const billsCents = sumWhere(events, (e) => e.included && e.kind === "BILL");
    const netCents = incomeCents - billsCents;
    const day: DaySummary = {
      date,
      openingBalanceCents: opening,
      incomeCents,
      billsCents,
      netCents,
      closingBalanceCents: opening + netCents,
      eventIds: events.map((e) => e.id),
    };
    opening = day.closingBalanceCents;
    return day;
  });
}

function sumWhere(events: LedgerEvent[], pred: (e: LedgerEvent) => boolean): number {
  let total = 0;
  for (const e of events) if (pred(e)) total += e.amountCents;
  return total;
}

/**
 * Groups consecutive days into weeks starting on `weekStartsOn`. Each week is
 * clipped to the returned days, so its opening is the closing of the day before
 * `rangeStart` and the weeks partition the events exactly.
 */
function buildWeeks(days: DaySummary[], weekStartsOn: number): WeekSummary[] {
  const groups = new Map<string, DaySummary[]>();
  for (const day of days) {
    const key = startOfWeek(day.date, weekStartsOn);
    const list = groups.get(key);
    if (list) list.push(day);
    else groups.set(key, [day]);
  }

  return [...groups.entries()].map(([weekStart, weekDays]) => {
    const weekEnd = addDays(weekStart, 6);
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    const incomeCents = weekDays.reduce((s, d) => s + d.incomeCents, 0);
    const billsCents = weekDays.reduce((s, d) => s + d.billsCents, 0);
    const lowest = lowestEndOfDay(weekDays);
    return {
      weekStart,
      weekEnd,
      rangeStart: maxDate(first.date, weekStart),
      rangeEnd: minDate(last.date, weekEnd),
      partial: first.date > weekStart || last.date < weekEnd,
      openingBalanceCents: first.openingBalanceCents,
      incomeCents,
      billsCents,
      netCents: incomeCents - billsCents,
      closingBalanceCents: last.closingBalanceCents,
      lowestBalanceCents: lowest.cents,
      hasNegative: lowest.cents < 0,
      eventIds: weekDays.flatMap((d) => d.eventIds),
    };
  });
}

/**
 * Minimum end-of-day balance, including the opening balance (section 7).
 * The opening balance is attributed to the first day; ties keep the earliest date.
 */
function lowestEndOfDay(days: DaySummary[]): { cents: number; date: string } {
  let best = { cents: days[0].openingBalanceCents, date: days[0].date };
  for (const d of days) {
    if (d.closingBalanceCents < best.cents) best = { cents: d.closingBalanceCents, date: d.date };
  }
  return best;
}

function buildTotals(days: DaySummary[]): ProjectionTotals {
  const first = days[0];
  const last = days[days.length - 1];
  const incomeCents = days.reduce((s, d) => s + d.incomeCents, 0);
  const billsCents = days.reduce((s, d) => s + d.billsCents, 0);
  const lowest = lowestEndOfDay(days);
  const negativeDays = days.filter((d) => d.closingBalanceCents < 0);
  // A negative opening balance means the range starts below zero on its first day.
  const firstNegativeDate = first.openingBalanceCents < 0 ? first.date : (negativeDays[0]?.date ?? null);
  return {
    incomeCents,
    billsCents,
    netCents: incomeCents - billsCents,
    openingBalanceCents: first.openingBalanceCents,
    endingBalanceCents: last.closingBalanceCents,
    lowestBalanceCents: lowest.cents,
    lowestBalanceDate: lowest.date,
    firstNegativeDate,
    negativeDayCount: negativeDays.length,
  };
}
