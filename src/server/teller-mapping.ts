/**
 * Pure mapping from Teller's wire format to our DTOs. No I/O, so it is unit-tested directly.
 * Money is parsed from Teller's decimal strings with string arithmetic, never floats
 * (docs/CONVENTIONS.md §1).
 */
import type { BankAccountDTO, BankTransactionDTO } from "../contracts/api";

export interface TellerAccount {
  id: string;
  enrollment_id?: string;
  institution?: { id?: string; name?: string };
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  currency: string;
  status: string;
}

export interface TellerTransaction {
  id: string;
  account_id: string;
  date: string;
  description: string;
  amount: string;
  status: string; // posted | pending
  details?: {
    category?: string | null;
    counterparty?: { name?: string | null; type?: string | null } | null;
  } | null;
}

const DECIMAL_AMOUNT = /^([+-])?(\d+)?(?:\.(\d+))?$/;

/**
 * Parses a signed decimal string such as "-12.5", "+3", "0.07" into integer cents.
 * Extra fractional digits are rounded half away from zero by looking only at the
 * third digit. Returns null for anything that isn't a plain decimal number.
 */
export function decimalStringToCents(input: string): number | null {
  const match = DECIMAL_AMOUNT.exec(input.trim());
  if (!match) return null;
  const [, sign = "", whole = "", frac = ""] = match;
  if (whole === "" && frac === "") return null;
  const wholeDigits = whole || "0";
  const cents = Number(wholeDigits) * 100 + Number((frac + "00").slice(0, 2)) + (Number(frac[2] ?? "0") >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(cents)) return null;
  return sign === "-" && cents !== 0 ? -cents : cents;
}

/**
 * Converts a Teller `amount` to signed cents where money in is positive and money out is
 * negative. Teller documents `amount` only as "signed" and does not say which sign means
 * money out; for depository accounts a debit is negative. This is the single place to
 * flip the convention if sandbox data shows otherwise (add an account-type parameter if
 * credit cards turn out to differ).
 */
export function tellerAmountToSignedCents(amount: string): number {
  const cents = decimalStringToCents(amount);
  if (cents === null) throw new Error(`Unrecognized Teller amount: ${JSON.stringify(amount)}`);
  return cents;
}

export function toBankAccountDTO(a: TellerAccount): BankAccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    lastFour: a.last_four,
    currency: a.currency,
    status: a.status,
  };
}

export function toBankTransactionDTO(t: TellerTransaction): BankTransactionDTO {
  return {
    id: t.id,
    accountId: t.account_id,
    date: t.date,
    description: t.description,
    counterparty: t.details?.counterparty?.name?.trim() || null,
    category: t.details?.category ?? null,
    amountCents: tellerAmountToSignedCents(t.amount),
    pending: t.status === "pending",
  };
}
