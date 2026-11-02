/**
 * APR text <-> basis points. The UI shows a percent ("19.99"); the API stores
 * integer basis points (1999). Blank means "no APR set" and maps to null.
 */
export type AprParseResult = { ok: true; basisPoints: number | null } | { ok: false };

const MAX_APR_PERCENT = 1000;

export function parseAprInput(text: string): AprParseResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, basisPoints: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) > MAX_APR_PERCENT) return { ok: false };
  return { ok: true, basisPoints: Math.round(Number(trimmed) * 100) };
}

export function aprToInputText(basisPoints: number | null): string {
  return basisPoints === null ? "" : (basisPoints / 100).toString();
}
