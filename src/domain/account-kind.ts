import type { AccountKind } from "../contracts/api";

const CREDIT = /\b(credit\s+card|line\s+of\s+credit|credit\s+line|heloc)\b/i;
const LOAN = /\b(loan|mortgage)\b/i;
// Card networks and issuers: a card named after its network/issuer (e.g. "Sapphire Preferred")
// with no "credit card" words still defaults to CREDIT.
const CARD_NETWORK = /\b(visa|mastercard|amex|american\s+express|discover|diners|jcb)\b/i;
const CARD_ISSUER = /\b(chase|citi|capital\s*one|synchrony|comenity|barclays|sapphire|freedom|preferred|rewards|cashback|cash\s*back|platinum|signature)\b/i;
const BANK_HINT = /\b(debit|checking|savings|cheque)\b/i;

/**
 * First label for an account the app has not seen before, from its name (and, when available,
 * its first synced balance). Deliberately conservative: "Credit Union Checking" and
 * "Visa Debit Card Checking" stay bank accounts. Never applied again after the user picks a
 * label: it only stops a new credit line from being summed into the starting balance by default.
 *
 * A negative balance on first sync suggests a credit card (money owed), so such an account is
 * labelled CREDIT unless its name clearly says bank/debit/checking/savings.
 */
export function guessAccountKind(name: string, balanceCents?: number): AccountKind {
  if (LOAN.test(name)) return "LOAN";
  if (BANK_HINT.test(name)) return "BANK";
  if (CREDIT.test(name)) return "CREDIT";
  if (CARD_NETWORK.test(name)) return "CREDIT";
  if (CARD_ISSUER.test(name)) return "CREDIT";
  if (balanceCents !== undefined && balanceCents < 0) return "CREDIT";
  return "BANK";
}
