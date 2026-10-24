/**
 * Decimal-safe money helpers. Money is always integer cents; conversion to and
 * from user-facing strings is done with string arithmetic, never floats.
 * Pure and client-safe (used by both the API and the UI).
 */

const MONEY_INPUT = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Parses user input such as "1,234.56", "$12.99", "0.1", "-50" into integer cents.
 * Returns null when the input is not a valid amount with at most 2 decimals.
 */
export function parseMoneyToCents(input: string, { allowNegative = false } = {}): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/^-\$/, "-").replace(/\s+/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const match = MONEY_INPUT.exec(cleaned);
  if (!match) return null;
  const [, minus, wholeRaw = "", fracRaw = ""] = match;
  if (minus && !allowNegative) return null;
  if (wholeRaw === "" && fracRaw === "") return null;
  const whole = wholeRaw.replace(/,/g, "") || "0";
  const frac = (fracRaw + "00").slice(0, 2);
  const cents = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(cents)) return null;
  return minus && cents !== 0 ? -cents : cents;
}

/** Exact decimal string for integer cents, e.g. 1299 -> "12.99", -5 -> "-0.05". */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** Value to prefill an amount input when editing, e.g. 120000 -> "1200.00". */
export const centsToInputValue = centsToDecimalString;

export interface FormatOptions {
  currency?: string;
  locale?: string;
  /** "always" renders +$1.00 for positive values (useful for income/net change). */
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

/** Formats integer cents as currency without floating-point conversion. */
export function formatCents(cents: number, { currency = "USD", locale = "en-US", signDisplay = "auto" }: FormatOptions = {}): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Intl.NumberFormat accepts exact decimal strings (ES2023); the cast keeps older lib typings happy.
  return formatter.format(centsToDecimalString(cents) as unknown as number);
}

/** Sums integer cents, guarding against accidental non-integer input. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`cents must be an integer, got ${v}`);
    total += v;
  }
  return total;
}
