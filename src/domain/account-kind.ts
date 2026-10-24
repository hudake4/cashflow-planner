import type { AccountKind } from "../contracts/api";

const CREDIT = /\b(credit\s+card|line\s+of\s+credit|credit\s+line|heloc)\b/i;
const LOAN = /\b(loan|mortgage)\b/i;

/**
 * First label for an account the app has not seen before, from its name. Deliberately narrow
 * ("Credit Union Checking" stays a bank account) and never applied again after the user picks
 * a label: it only stops a new credit line from being summed into the starting balance by default.
 */
export function guessAccountKind(name: string): AccountKind {
  if (LOAN.test(name)) return "LOAN";
  if (CREDIT.test(name)) return "CREDIT";
  return "BANK";
}
