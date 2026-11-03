import type { BalanceHistoryDay } from "../contracts/api";
import { eachDay, maxDate } from "./dates";

/** One BANK account as the history needs it: its latest balance and its settled transactions. */
export interface HistoryAccount {
  balanceCents: number;
  /** The date `balanceCents` was reported for. */
  balanceDate: string;
  /** The oldest date this account's stored transactions are complete from (CONVENTIONS section 21). */
  coverageStart: string;
  /** Settled (non-pending) transactions, signed: money in positive, money out negative. */
  transactions: { date: string; amountCents: number }[];
}

export interface BalanceHistory {
  days: BalanceHistoryDay[];
  /** The oldest date every account is complete from; null when there are no accounts. */
  coverageStart: string | null;
}

/**
 * End-of-day balances of the BANK accounts for `from`..`to`, worked backward from each account's
 * latest balance (CONVENTIONS section 21). For an account, the balance at the end of day D is its
 * balance minus every settled transaction dated after D up to its balance date; on or after its
 * balance date it is the balance itself. The days are summed across accounts.
 *
 * A day before any account's `coverageStart` is left out: its transactions would be missing, so
 * the number would be wrong rather than merely rough.
 */
export function buildBalanceHistory(accounts: HistoryAccount[], from: string, to: string): BalanceHistory {
  if (accounts.length === 0) return { days: [], coverageStart: null };
  const coverageStart = accounts.map((a) => a.coverageStart).reduce(maxDate);
  const first = maxDate(from, coverageStart);
  if (first > to) return { days: [], coverageStart };

  const dates = eachDay(first, to);
  const totals = new Array<number>(dates.length).fill(0);
  for (const account of accounts) {
    const net = new Map<string, number>();
    let after = 0; // settled transactions dated after the day being visited, up to the balance date
    for (const t of account.transactions) {
      if (t.date > account.balanceDate) continue;
      if (t.date > to) after += t.amountCents;
      else net.set(t.date, (net.get(t.date) ?? 0) + t.amountCents);
    }
    for (let i = dates.length - 1; i >= 0; i--) {
      totals[i] += account.balanceCents - after;
      after += net.get(dates[i]) ?? 0;
    }
  }
  return { days: dates.map((date, i) => ({ date, closingBalanceCents: totals[i] })), coverageStart };
}
