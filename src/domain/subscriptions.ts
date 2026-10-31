import type { BillDTO, BillFrequency, RecurringFrequency, RecurringSuggestionDTO } from "../contracts/api";
import { addDays, diffDays } from "./dates";
import { generateOccurrences } from "./recurrence";

export type SubscriptionSource = "DETECTED" | "TRACKED";

/** One line in the subscription audit: a detected recurring charge or a tracked bill. */
export interface SubscriptionAuditRow {
  /** Unique, stable key for React lists. Detected rows reuse the suggestion key; tracked rows use `TRACKED:<bill id>`. */
  key: string;
  source: SubscriptionSource;
  name: string;
  /** Positive magnitude per charge. */
  amountCents: number;
  /** `RecurringFrequency` for detected rows, `BillFrequency` for tracked rows. */
  frequency: string;
  /** Detected rows only: how many times it appeared in the history window (0 for tracked). */
  occurrences: number;
  /** Detected rows only: dates it was seen on, ascending (empty for tracked). */
  seenDates: string[];
  /** Detected rows only: true when the amounts differ noticeably between occurrences. */
  amountVaries: boolean;
  /** Detected: next expected charge. Tracked: next scheduled due date on or after today (null when none). */
  nextDate: string | null;
  /** Detected rows only: the most recent sighting (null for tracked). */
  lastChargedDate: string | null;
  /** Detected rows only: days since the last sighting (0 for tracked). */
  daysSinceLastCharge: number;
  /** Annualised cost. 0 for a paused (inactive) tracked bill, which is not currently being charged. */
  annualCostCents: number;
  /** Detected rows only: the charge has been idle past its cadence and looks stopped or unused. */
  cancelCandidate: boolean;
  /** True for the user's own bills. */
  tracked: boolean;
  /** True for a tracked bill the user paused. */
  paused: boolean;
}

export interface SubscriptionAudit {
  rows: SubscriptionAuditRow[];
  cancelCandidates: SubscriptionAuditRow[];
  /** Annual cost of detected charges plus active tracked bills. */
  totalAnnualCostCents: number;
  /** Annual cost of the cancel candidates only. */
  candidateAnnualCostCents: number;
  currency?: string;
}

export interface SubscriptionAuditInput {
  /** Detected recurring charges (the endpoint already filters these to BILL kind, minus dismissals). */
  suggestions: RecurringSuggestionDTO[];
  /** The user's tracked bills. */
  tracked: BillDTO[];
  /** Server-local calendar date. */
  today: string;
  currency?: string;
}

const FREQUENCY_MULTIPLIER: Record<BillFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
  ONE_TIME: 1,
};

export function annualCostCents(amountCents: number, frequency: BillFrequency): number {
  return amountCents * FREQUENCY_MULTIPLIER[frequency];
}

/** The usual gap, in days, between consecutive charges of each cadence. */
const CADENCE_INTERVAL_DAYS: Record<RecurringFrequency, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 };

/** How far past its interval a charge may go before it looks stopped/unused. */
const CANCEL_GRACE_DAYS: Record<RecurringFrequency, number> = { WEEKLY: 4, BIWEEKLY: 7, MONTHLY: 7 };

/**
 * A charge is a "cancel candidate" (looks stopped or unused) when it has been idle longer than its
 * expected interval plus a grace period. Cadence-aware, so a monthly bill due today is never flagged.
 */
export function isCancelCandidate(frequency: string, daysSinceLastCharge: number): boolean {
  const interval = CADENCE_INTERVAL_DAYS[frequency as RecurringFrequency];
  if (interval === undefined) return false;
  const grace = CANCEL_GRACE_DAYS[frequency as RecurringFrequency] ?? 7;
  return daysSinceLastCharge > interval + grace;
}

/** Next scheduled due date on or after today, or null when the schedule has ended. */
function nextOccurrence(frequency: string, anchorDate: string, endDate: string | null, today: string): string | null {
  // A year ahead is enough for every cadence (yearly at most once within it).
  const horizon = addDays(today, 400);
  return generateOccurrences({ frequency: frequency as BillDTO["frequency"], anchorDate, endDate }, today, horizon)[0] ?? null;
}

/**
 * Builds the subscription audit: the user's subscriptions = detected recurring charges (bills only)
 * plus the bills they already track. Income is deliberately excluded — this view is about money out.
 */
export function buildSubscriptionAudit(input: SubscriptionAuditInput): SubscriptionAudit {
  const { suggestions, tracked, today, currency } = input;
  const rows: SubscriptionAuditRow[] = [];

  for (const s of suggestions) {
    if (s.kind !== "BILL") continue; // defensive; the endpoint already filters to bills
    const lastChargedDate = s.seenDates.length ? s.seenDates[s.seenDates.length - 1] : null;
    const daysSinceLastCharge = lastChargedDate ? diffDays(lastChargedDate, today) : 0;
    rows.push({
      key: s.key,
      source: "DETECTED",
      name: s.name,
      amountCents: s.amountCents,
      frequency: s.frequency,
      occurrences: s.occurrences,
      seenDates: s.seenDates,
      amountVaries: s.amountVaries,
      nextDate: s.nextDate,
      lastChargedDate,
      daysSinceLastCharge,
      annualCostCents: annualCostCents(s.amountCents, s.frequency),
      cancelCandidate: isCancelCandidate(s.frequency, daysSinceLastCharge),
      tracked: false,
      paused: false,
    });
  }

  for (const b of tracked) {
    if (b.frequency === "ONE_TIME") continue; // a one-off isn't a subscription
    rows.push({
      key: `TRACKED:${b.id}`,
      source: "TRACKED",
      name: b.name,
      amountCents: b.amountCents,
      frequency: b.frequency,
      occurrences: 0,
      seenDates: [],
      amountVaries: false,
      nextDate: nextOccurrence(b.frequency, b.anchorDate, b.endDate, today),
      lastChargedDate: null,
      daysSinceLastCharge: 0,
      annualCostCents: b.active ? annualCostCents(b.amountCents, b.frequency) : 0,
      cancelCandidate: false,
      tracked: true,
      paused: !b.active,
    });
  }

  const cancelCandidates = rows.filter((r) => r.cancelCandidate);
  return {
    rows,
    cancelCandidates,
    totalAnnualCostCents: rows.reduce((sum, r) => sum + r.annualCostCents, 0),
    candidateAnnualCostCents: cancelCandidates.reduce((sum, r) => sum + r.annualCostCents, 0),
    currency,
  };
}

export default buildSubscriptionAudit;
