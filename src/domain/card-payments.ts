/**
 * Card payments (CONVENTIONS section 13). Pure: no Prisma, no clock, no I/O.
 *
 * Paying a card appears twice in the bank data: money out of a bank account and money in on the
 * credit account. The purchases it settles are already counted on the card, so the bank side must
 * not count again. Bank descriptions vary too much to rely on words, so a bank debit is a card
 * payment when a credit account received exactly the same amount within a few days.
 */
import type { AccountKind } from "../contracts/api";
import { diffDays } from "./dates";

/** Most days the two sides of one payment can be apart (banks post at different times, weekends add more). */
export const PAYMENT_MATCH_DAYS = 5;

export interface PaymentCandidate {
  id: string;
  date: string;
  /** Signed like the bank: money in positive, money out negative. */
  amountCents: number;
  accountKind: AccountKind;
}

/**
 * Ids of the bank-account debits that pay a credit account. Each credit-account receipt pairs with at
 * most one debit and the other way round; the closest dates pair first.
 */
export function matchCardPayments(transactions: readonly PaymentCandidate[]): Set<string> {
  const debits = new Map<number, PaymentCandidate[]>();
  for (const t of transactions) {
    if (t.accountKind !== "BANK" || t.amountCents >= 0) continue;
    const list = debits.get(-t.amountCents) ?? [];
    list.push(t);
    debits.set(-t.amountCents, list);
  }

  const pairs: { debit: string; credit: string; gap: number }[] = [];
  for (const credit of transactions) {
    if (credit.accountKind !== "CREDIT" || credit.amountCents <= 0) continue;
    for (const debit of debits.get(credit.amountCents) ?? []) {
      const gap = Math.abs(diffDays(debit.date, credit.date));
      if (gap <= PAYMENT_MATCH_DAYS) pairs.push({ debit: debit.id, credit: credit.id, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || (a.debit < b.debit ? -1 : a.debit > b.debit ? 1 : 0) || (a.credit < b.credit ? -1 : a.credit > b.credit ? 1 : 0));

  const paid = new Set<string>();
  const received = new Set<string>();
  for (const { debit, credit } of pairs) {
    if (paid.has(debit) || received.has(credit)) continue;
    paid.add(debit);
    received.add(credit);
  }
  return paid;
}

export interface TransferCandidate extends PaymentCandidate {
  accountId: string;
}

/**
 * Ids of the bank-account receipts that are money moved from another bank account (checking to
 * savings): the same amount left a different `BANK` account within a few days. Same pairing as
 * card payments: one receipt per debit, the closest dates first.
 */
export function matchBankTransfers(transactions: readonly TransferCandidate[]): Set<string> {
  const debits = new Map<number, TransferCandidate[]>();
  for (const t of transactions) {
    if (t.accountKind !== "BANK" || t.amountCents >= 0) continue;
    const list = debits.get(-t.amountCents) ?? [];
    list.push(t);
    debits.set(-t.amountCents, list);
  }

  const pairs: { debit: string; receipt: string; gap: number }[] = [];
  for (const receipt of transactions) {
    if (receipt.accountKind !== "BANK" || receipt.amountCents <= 0) continue;
    for (const debit of debits.get(receipt.amountCents) ?? []) {
      const gap = Math.abs(diffDays(debit.date, receipt.date));
      if (debit.accountId !== receipt.accountId && gap <= PAYMENT_MATCH_DAYS) pairs.push({ debit: debit.id, receipt: receipt.id, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap || (a.debit < b.debit ? -1 : a.debit > b.debit ? 1 : 0) || (a.receipt < b.receipt ? -1 : a.receipt > b.receipt ? 1 : 0));

  const paid = new Set<string>();
  const received = new Set<string>();
  for (const { debit, receipt } of pairs) {
    if (paid.has(debit) || received.has(receipt)) continue;
    paid.add(debit);
    received.add(receipt);
  }
  return received;
}
