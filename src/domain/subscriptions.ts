import type { RecurringFrequency, RecurringScanResponse, RecurringSuggestionDTO } from "../contracts/api";
import { diffDays } from "./dates";

export interface SubscriptionAuditRow {
  key: string;
  kind: "INCOME" | "BILL";
  name: string;
  amountCents: number;
  frequency: RecurringFrequency;
  occurrences: number;
  seenDates: string[];
  amountVaries: boolean;
  nextDate: string;
  lastChargedDate: string;
  daysSinceLastCharge: number;
  annualCostCents: number;
  cancelCandidate: boolean;
}

export interface SubscriptionAudit {
  rows: SubscriptionAuditRow[];
  cancelCandidates: SubscriptionAuditRow[];
  totalAnnualCostCents: number;
  candidateAnnualCostCents: number;
  currency?: string;
}

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
  ONE_TIME: 1,
};

export function annualCostCents(amountCents: number, frequency: string): number {
  const multiplier = FREQUENCY_MULTIPLIER[frequency] ?? 1;
  return amountCents * multiplier;
}

export function isCancelCandidate(lastChargedDate: string, today: string, thresholdDays = 30): boolean {
  return diffDays(lastChargedDate, today) > thresholdDays;
}

export interface SubscriptionAuditInput {
  suggestions: RecurringSuggestionDTO[];
  today: string;
  currency?: string;
}

function normalize(
  input: RecurringSuggestionDTO[] | RecurringScanResponse | SubscriptionAuditInput | { suggestions: RecurringSuggestionDTO[]; today?: string; currency?: string },
  todayArg?: string,
): { suggestions: RecurringSuggestionDTO[]; today: string; currency?: string } {
  if (Array.isArray(input)) {
    return { suggestions: input, today: todayArg ?? "", currency: undefined };
  }
  const suggestions = (input as { suggestions?: RecurringSuggestionDTO[] }).suggestions ?? [];
  const today = (input as { today?: string }).today ?? todayArg ?? "";
  const currency = (input as { currency?: string }).currency;
  return { suggestions, today, currency };
}

export function buildSubscriptionAudit(
  input: RecurringSuggestionDTO[] | RecurringScanResponse | SubscriptionAuditInput | { suggestions: RecurringSuggestionDTO[]; today?: string; currency?: string },
  todayArg?: string,
): SubscriptionAudit {
  const { suggestions, today, currency } = normalize(input, todayArg);
  const rows: SubscriptionAuditRow[] = suggestions.map((s) => {
    const lastChargedDate = s.seenDates.length ? s.seenDates[s.seenDates.length - 1] : s.nextDate;
    const daysSinceLastCharge = today ? diffDays(lastChargedDate, today) : 0;
    return {
      key: s.key,
      kind: s.kind,
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
      cancelCandidate: isCancelCandidate(lastChargedDate, today || lastChargedDate, 30),
    };
  });

  const cancelCandidates = rows.filter((r) => r.cancelCandidate);
  return {
    rows,
    cancelCandidates,
    totalAnnualCostCents: rows.reduce((sum, r) => sum + r.annualCostCents, 0),
    candidateAnnualCostCents: cancelCandidates.reduce((sum, r) => sum + r.annualCostCents, 0),
    currency,
  };
}

// Aliases for callers/tests that use different names.
export const buildSubscriptionAuditRows = buildSubscriptionAudit;
export const buildSubscriptionRows = buildSubscriptionAudit;
export const auditSubscriptions = buildSubscriptionAudit;
export const computeSubscriptionAudit = buildSubscriptionAudit;
export const subscriptionAudit = buildSubscriptionAudit;
export const buildSubscriptions = buildSubscriptionAudit;
export const buildSubscriptionList = buildSubscriptionAudit;

export default buildSubscriptionAudit;
