/**
 * Global search matching and ranking (CONVENTIONS section 20). Pure: the repository loads
 * the rows, these helpers decide which match and in what order.
 */
import { parseMoneyToCents } from "./money";

/** Lower is better. A text that equals the query beats one that starts with it, and so on. */
export const RANK_EXACT = 0;
export const RANK_PREFIX = 1;
export const RANK_WORD_PREFIX = 2;
export const RANK_CONTAINS = 3;
/** Added to the rank of a match in a secondary field (notes, category, account name), so a name match always wins. */
export const SECONDARY_PENALTY = 4;
/** An amount equal to the typed one ranks like a prefix match in a primary field. */
export const RANK_AMOUNT = RANK_PREFIX;

/** Trims, lower-cases, drops accents and collapses runs of whitespace, so "  Café   Rouge " finds "cafe rouge". */
export function normalizeQuery(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Rank of `text` for an already normalized query, or null when it does not match. */
export function matchRank(text: string | null | undefined, query: string): number | null {
  if (!query || !text) return null;
  const t = normalizeQuery(text);
  if (t === query) return RANK_EXACT;
  if (t.startsWith(query)) return RANK_PREFIX;
  if (t.includes(` ${query}`)) return RANK_WORD_PREFIX;
  if (t.includes(query)) return RANK_CONTAINS;
  return null;
}

/**
 * Best rank over the primary fields (name, description) and the secondary ones (notes,
 * category, account), or null when nothing matches.
 */
export function rankFields(
  query: string,
  primary: readonly (string | null | undefined)[],
  secondary: readonly (string | null | undefined)[] = [],
): number | null {
  let best: number | null = null;
  const consider = (rank: number | null, penalty: number) => {
    if (rank === null) return;
    const total = rank + penalty;
    if (best === null || total < best) best = total;
  };
  for (const text of primary) consider(matchRank(text, query), 0);
  for (const text of secondary) consider(matchRank(text, query), SECONDARY_PENALTY);
  return best;
}

/**
 * The amount a query asks for, as positive cents ("45.20", "$45", "-1,200" -> 4520, 4500, 120000),
 * or null when the query is not a plain amount. Zero is not searched for. The sign is ignored:
 * a bank debit is stored negative but people type the amount they remember.
 */
export function parseAmountQuery(raw: string): number | null {
  const cents = parseMoneyToCents(raw, { allowNegative: true });
  if (cents === null || cents === 0) return null;
  return Math.abs(cents);
}

/** True when a stored amount (either sign) equals the amount asked for. */
export function amountMatches(amountCents: number, queryCents: number | null): boolean {
  return queryCents !== null && Math.abs(amountCents) === queryCents;
}

/** Keeps the items that match, best rank first (ties by `tieBreak`), at most `limit` of them. */
export function selectTop<T>(
  items: readonly T[],
  rankOf: (item: NoInfer<T>) => number | null,
  tieBreak: (a: NoInfer<T>, b: NoInfer<T>) => number,
  limit: number,
): T[] {
  const ranked: { item: T; rank: number }[] = [];
  for (const item of items) {
    const rank = rankOf(item);
    if (rank !== null) ranked.push({ item, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || tieBreak(a.item, b.item));
  return ranked.slice(0, limit).map((r) => r.item);
}
