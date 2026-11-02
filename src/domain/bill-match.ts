/**
 * Matches synced bank transactions to unpaid bill occurrences (CONVENTIONS section 14). Pure: no
 * Prisma, no clock (today is passed in), no I/O.
 *
 * It only finds candidates. Marking an occurrence paid is the user's decision, and it is a tracking
 * mark that never changes the projection (section 5), so nothing here touches amounts or balances.
 * Merchant names are compared with the same helpers the recurring-payment scan uses (section 12).
 */
import type { BillFrequency, BillPaymentMatchDTO, OccurrenceStatus } from "../contracts/api";
import { addDays, diffDays } from "./dates";
import { generateOccurrences } from "./recurrence";
import { namesOverlap, nameTokens, sharesLeadWord, within } from "./recurring";

/** How far a payment may post from the due date: banks post a day or two late, autopay can go early. */
export const MATCH_DATE_TOLERANCE_DAYS = 3;
/** How far the paid amount may be from the expected amount, as a fraction of the larger one (variable bills). */
export const MATCH_AMOUNT_TOLERANCE = 0.1;

export interface MatchTransaction {
  id: string;
  date: string;
  description: string;
  /** Signed like the bank: money in positive, money out negative. */
  amountCents: number;
}

export interface MatchBill {
  id: string;
  name: string;
  amountCents: number;
  frequency: BillFrequency;
  anchorDate: string;
  endDate: string | null;
  active: boolean;
}

export interface MatchOccurrence {
  billId: string;
  dueDate: string;
  status: OccurrenceStatus;
  amountOverrideCents: number | null;
  note: string | null;
}

export interface MatchInput {
  /** Settled (non-pending) transactions. */
  transactions: MatchTransaction[];
  bills: MatchBill[];
  /** Recorded occurrence rows; a date with no row is UPCOMING. */
  occurrences: MatchOccurrence[];
  /** Server-local calendar date. */
  today: string;
}

interface Candidate {
  bill: MatchBill;
  dueDate: string;
  expectedCents: number;
  override: MatchOccurrence | undefined;
  tx: MatchTransaction;
  cents: number;
  dateGap: number;
  amountGap: number;
}

const compare = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/** Lower is better: closest date first, then closest amount. */
const byScore = (a: Candidate, b: Candidate) => a.dateGap - b.dateGap || a.amountGap - b.amountGap;

/**
 * Pairs each unpaid occurrence of an active bill with at most one transaction. A transaction counts
 * when it is money out, posted within MATCH_DATE_TOLERANCE_DAYS of the due date, within
 * MATCH_AMOUNT_TOLERANCE of the expected amount, and names the same merchant as the bill.
 *
 * Paid and skipped occurrences are never offered. When one transaction fits occurrences of two
 * different bills equally well it is ambiguous and is offered for neither. Otherwise the best fit
 * (closest date, then closest amount) wins and each occurrence and transaction is used once.
 */
export function matchBillPayments({ transactions, bills, occurrences, today }: MatchInput): BillPaymentMatchDTO[] {
  const spent = transactions.filter((t) => t.amountCents < 0 && t.date <= today);
  if (spent.length === 0) return [];

  const recorded = new Map(occurrences.map((o) => [`${o.billId}:${o.dueDate}`, o]));
  const first = spent.reduce((min, t) => (t.date < min ? t.date : min), spent[0].date);
  const last = spent.reduce((max, t) => (t.date > max ? t.date : max), spent[0].date);
  const from = addDays(first, -MATCH_DATE_TOLERANCE_DAYS);
  const to = addDays(last, MATCH_DATE_TOLERANCE_DAYS);

  const txTokens = new Map(spent.map((t) => [t.id, nameTokens(t.description)]));
  const candidates: Candidate[] = [];
  for (const bill of bills) {
    if (!bill.active) continue;
    const billTokens = nameTokens(bill.name);
    for (const dueDate of generateOccurrences(bill, from, to)) {
      const override = recorded.get(`${bill.id}:${dueDate}`);
      if (override && override.status !== "UPCOMING") continue;
      const expectedCents = override?.amountOverrideCents ?? bill.amountCents;
      for (const tx of spent) {
        const dateGap = Math.abs(diffDays(dueDate, tx.date));
        if (dateGap > MATCH_DATE_TOLERANCE_DAYS) continue;
        const cents = -tx.amountCents;
        if (!within(expectedCents, cents, MATCH_AMOUNT_TOLERANCE)) continue;
        const tokens = txTokens.get(tx.id) as string[];
        if (!namesOverlap(billTokens, tokens) && !sharesLeadWord(billTokens, tokens)) continue;
        candidates.push({ bill, dueDate, expectedCents, override, tx, cents, dateGap, amountGap: Math.abs(expectedCents - cents) });
      }
    }
  }

  // A transaction that fits two bills equally well can't be attributed to either.
  const best = new Map<string, Candidate[]>();
  for (const c of candidates) best.set(c.tx.id, [...(best.get(c.tx.id) ?? []), c]);
  const ambiguous = new Set<string>();
  for (const [id, list] of best) {
    const top = [...list].sort(byScore)[0];
    const ties = list.filter((c) => byScore(c, top) === 0 && c.bill.id !== top.bill.id);
    if (ties.length > 0) ambiguous.add(id);
  }

  const taken = new Set<string>();
  const usedTx = new Set<string>();
  const picked: Candidate[] = [];
  const ordered = candidates
    .filter((c) => !ambiguous.has(c.tx.id))
    .sort((a, b) => byScore(a, b) || compare(a.bill.name, b.bill.name) || compare(a.bill.id, b.bill.id) || compare(a.tx.id, b.tx.id));
  for (const c of ordered) {
    const slot = `${c.bill.id}:${c.dueDate}`;
    if (taken.has(slot) || usedTx.has(c.tx.id)) continue;
    taken.add(slot);
    usedTx.add(c.tx.id);
    picked.push(c);
  }

  return picked
    .sort(
      (a, b) =>
        compare(a.dueDate, b.dueDate) || a.bill.name.localeCompare(b.bill.name) || compare(a.bill.id, b.bill.id),
    )
    .map((c) => ({
      billId: c.bill.id,
      billName: c.bill.name,
      dueDate: c.dueDate,
      expectedCents: c.expectedCents,
      amountOverrideCents: c.override?.amountOverrideCents ?? null,
      note: c.override?.note ?? null,
      transaction: { id: c.tx.id, date: c.tx.date, description: c.tx.description, cents: c.cents },
    }));
}
