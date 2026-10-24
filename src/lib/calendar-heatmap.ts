/**
 * Display helpers for the calendar balance heatmap. Presentation only: they
 * shorten and tint balances the API already computed and never derive money.
 */

const MINUS = "−";

/** Longest balance shown in full (with thousands separators) before switching to "12.5k". */
const FULL_LIMIT_DOLLARS = 10_000;
/** Same, for narrow cells (phones), where "$1,330" no longer fits. */
const TIGHT_LIMIT_DOLLARS = 1_000;

function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency");
  return part?.value ?? currency;
}

function trimmed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$/, "");
}

/**
 * A short balance for a heatmap cell: "$265", "$1,330", "$12.5k", "$125k", "$1.2M".
 * Negative balances get a leading true minus sign. `tight` switches to "k" from
 * $1,000 so the text fits a 38px phone cell. Cents are dropped; the full
 * amount lives in the cell's accessible label.
 */
export function compactBalance(cents: number, currency = "USD", tight = false): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  const sign = cents < 0 && dollars > 0 ? MINUS : "";
  const symbol = currencySymbol(currency);
  const limit = tight ? TIGHT_LIMIT_DOLLARS : FULL_LIMIT_DOLLARS;

  if (dollars < limit) return `${sign}${symbol}${dollars.toLocaleString("en-US")}`;

  const thousands = dollars / 1000;
  if (Math.round(thousands) >= 1000) return `${sign}${symbol}${trimmed(dollars / 1_000_000, 1)}M`;
  return `${sign}${symbol}${trimmed(thousands, thousands < 100 ? 1 : 0)}k`;
}

export interface HeatTint {
  tone: "positive" | "negative";
  /** 0..1 strength of the tint; the cell background is the tone color at this opacity. */
  alpha: number;
}

const POSITIVE_MIN_ALPHA = 0.05;
const POSITIVE_MAX_ALPHA = 0.2;
const NEGATIVE_ALPHA = 0.3;

/**
 * Tint for one day's end-of-day balance. Positive balances scale from a quiet
 * green to a stronger one relative to the highest positive balance in view;
 * anything below zero gets one fixed, stronger red (the icon and minus sign
 * carry the meaning too).
 */
export function heatTint(cents: number, maxPositiveCents: number): HeatTint {
  if (cents < 0) return { tone: "negative", alpha: NEGATIVE_ALPHA };
  const ratio = maxPositiveCents > 0 ? Math.min(1, cents / maxPositiveCents) : 0;
  return { tone: "positive", alpha: POSITIVE_MIN_ALPHA + (POSITIVE_MAX_ALPHA - POSITIVE_MIN_ALPHA) * ratio };
}

/** CSS color for a tint, built from the central palette variables so it follows light/dark. */
export function heatBackground(tint: HeatTint): string {
  const token = tint.tone === "negative" ? "--color-rose-600" : "--color-emerald-700";
  return `color-mix(in srgb, var(${token}) ${Math.round(tint.alpha * 100)}%, transparent)`;
}
