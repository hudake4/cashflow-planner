import { formatCents } from "@/domain/money";

export function money(cents: number, currency = "USD"): string {
  return formatCents(cents, { currency });
}

/** Signed display: "+$1,200.00" / "−$1,500.00" (true minus sign). */
export function signedMoney(cents: number, currency = "USD"): string {
  const abs = formatCents(Math.abs(cents), { currency });
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `−${abs}`;
  return abs;
}

/** Display a magnitude with an explicit sign from its kind. */
export function kindMoney(kind: "INCOME" | "BILL", amountCents: number, currency = "USD"): string {
  const abs = formatCents(Math.abs(amountCents), { currency });
  return kind === "INCOME" ? `+${abs}` : `−${abs}`;
}

/** Plain-text version for aria-labels ("minus" is announced reliably). */
export function spokenKindMoney(kind: "INCOME" | "BILL", amountCents: number, currency = "USD"): string {
  const abs = formatCents(Math.abs(amountCents), { currency });
  return kind === "INCOME" ? `plus ${abs}` : `minus ${abs}`;
}

export { FREQUENCY_LABELS } from "@/domain/frequency-labels";

export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "USD — US dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British pound" },
  { code: "CAD", label: "CAD — Canadian dollar" },
  { code: "AUD", label: "AUD — Australian dollar" },
  { code: "NZD", label: "NZD — New Zealand dollar" },
  { code: "CHF", label: "CHF — Swiss franc" },
  { code: "SEK", label: "SEK — Swedish krona" },
  { code: "NOK", label: "NOK — Norwegian krone" },
  { code: "DKK", label: "DKK — Danish krone" },
  { code: "INR", label: "INR — Indian rupee" },
  { code: "MXN", label: "MXN — Mexican peso" },
  { code: "BRL", label: "BRL — Brazilian real" },
  { code: "ZAR", label: "ZAR — South African rand" },
  { code: "SGD", label: "SGD — Singapore dollar" },
];
