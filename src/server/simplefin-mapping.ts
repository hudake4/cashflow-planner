/**
 * SimpleFIN Bridge: pure mapping helpers (no I/O, no clock). Everything that can be
 * unit-tested lives here; src/server/simplefin.ts does the network calls.
 *
 * Choices (documented in docs/CONVENTIONS.md section 9):
 *   - Amounts are decimal strings. They are converted to integer cents by STRING
 *     parsing, never floats. More than 2 decimals are rounded half away from zero.
 *   - Epoch seconds become the UTC calendar date (YYYY-MM-DD).
 *   - A currency that is not a 3-letter code (SimpleFIN allows a custom-currency URL)
 *     is stored as "USD", because the app only formats ISO currencies.
 *   - Bad optional data never fails a whole sync: unreadable accounts and transactions
 *     are skipped and reported as warnings.
 *   - Secrets (setup token, access URL, password) never appear in error messages.
 */
import { z } from "zod";
import { HISTORY_DAYS } from "../contracts/api";
import { addDays } from "../domain/dates";
import { ApiError, badRequest } from "./http";

const DAY_SECONDS = 86_400;
/** Longest span one SimpleFIN request covers (they allow 90 days). Not the retention window: see HISTORY_DAYS. */
const MAX_SPAN_DAYS = 89;

export { HISTORY_DAYS };

/** The oldest `YYYY-MM-DD` that is still within the history window, given today's date. */
export function historyCutoff(today: string): string {
  return addDays(today, -(HISTORY_DAYS - 1));
}
/** Largest magnitude we store: Prisma `Int` is a signed 32-bit integer. */
export const MAX_STORED_CENTS = 2_147_483_647;
const MAX_WARNINGS = 10;
const MAX_WARNING_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 500;

// ---------------------------------------------------------------------------
// Hosts and tokens
// ---------------------------------------------------------------------------

/** True for `simplefin.org` and its subdomains (e.g. bridge.simplefin.org). */
export function isSimplefinHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "simplefin.org" || h.endsWith(".simplefin.org");
}

const TOKEN_ERROR = "That doesn't look like a SimpleFIN setup token. Copy the whole token from SimpleFIN Bridge and paste it again.";

/**
 * Decodes a setup token (base64 of the claim URL) and validates it. Only https URLs on
 * simplefin.org are accepted, so a pasted token can never make the server call another host.
 * Throws 400 BAD_REQUEST before any network call. Returns the claim URL.
 */
export function decodeSetupToken(token: string): string {
  const compact = token.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) || compact.length > 2000) throw badRequest(TOKEN_ERROR);
  const decoded = Buffer.from(compact.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    throw badRequest(TOKEN_ERROR);
  }
  if (url.protocol !== "https:" || !isSimplefinHost(url.hostname) || url.username || url.password || url.port) {
    throw badRequest("That setup token doesn't point at SimpleFIN Bridge, so it was not used.");
  }
  return url.toString();
}

/** Validates the Access URL returned by a claim: https, SimpleFIN host, with credentials. */
export function isValidAccessUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isSimplefinHost(url.hostname) && url.username !== "" && !url.port;
  } catch {
    return false;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Splits an Access URL into a credential-free base URL and a Basic `Authorization` header
 * (fetch() refuses URLs with embedded credentials). Throws a 502 whose message never
 * contains the URL.
 */
export function parseAccessUrl(accessUrl: string): { baseUrl: string; authorization: string } {
  if (!isValidAccessUrl(accessUrl)) {
    throw new ApiError(502, "UPSTREAM_ERROR", "The stored SimpleFIN connection is invalid. Remove it and add a new setup token.");
  }
  const url = new URL(accessUrl);
  const credentials = `${safeDecode(url.username)}:${safeDecode(url.password)}`;
  const authorization = `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
  const path = url.pathname.replace(/\/+$/, "");
  return { baseUrl: `${url.protocol}//${url.host}${path}`, authorization };
}

export interface FetchWindow {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
  /** Include pending transactions. */
  pending: boolean;
}

/** `{baseUrl}/accounts?version=2&start-date=...&end-date=...&pending=1` (epoch seconds). */
export function buildAccountsUrl(baseUrl: string, { start, end, pending }: FetchWindow): string {
  const params = new URLSearchParams();
  params.set("version", "2");
  params.set("start-date", String(Math.floor(start.getTime() / 1000)));
  params.set("end-date", String(Math.floor(end.getTime() / 1000)));
  if (pending) params.set("pending", "1");
  return `${baseUrl}/accounts?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// HTTP failures -> ApiError
// ---------------------------------------------------------------------------

/** Maps a non-200 SimpleFIN status to an ApiError. Messages never contain secrets. */
export function mapHttpFailure(phase: "claim" | "fetch", status: number): ApiError {
  if (phase === "claim" && (status === 403 || status === 404)) {
    return badRequest(
      "That setup token is invalid or has already been used. A token works only once, so create a new one in SimpleFIN Bridge and paste it here.",
    );
  }
  if (phase === "fetch" && status === 403) {
    return new ApiError(
      502,
      "UPSTREAM_ERROR",
      "SimpleFIN access was revoked or is invalid. Remove this connection and add a new setup token.",
    );
  }
  if (status === 402) {
    return new ApiError(502, "UPSTREAM_ERROR", "Your SimpleFIN subscription needs payment or renewal. Check your SimpleFIN Bridge account.");
  }
  if (status === 429) {
    return new ApiError(
      502,
      "UPSTREAM_ERROR",
      "SimpleFIN is rate limiting this connection (limit: 24 requests a day). Wait before refreshing again.",
    );
  }
  return unavailable(status);
}

export function unavailable(status?: number): ApiError {
  return new ApiError(
    502,
    "UPSTREAM_ERROR",
    `SimpleFIN Bridge is unavailable${status ? ` (HTTP ${status})` : ""}. Try again later.`,
  );
}

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Signed decimal string -> integer cents by string parsing: "-12.34" -> -1234, "12" -> 1200,
 * "12.3" -> 1230, "+5.00" -> 500, ".5" -> 50. More than 2 decimals round half away from
 * zero ("1.005" -> 101, "-1.005" -> -101). Returns null for anything that is not a plain
 * decimal (exponents, text, empty) or does not fit the stored 32-bit range.
 */
export function parseSignedDecimalToCents(input: string | number): number | null {
  const text = (typeof input === "number" ? (Number.isFinite(input) ? String(input) : "") : input).trim();
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign, whole = "", frac = ""] = match;
  if (whole === "" && frac === "") return null;
  let cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (frac.length > 2 && frac.charCodeAt(2) >= 53 /* '5' */) cents += 1;
  if (!Number.isSafeInteger(cents) || cents > MAX_STORED_CENTS) return null;
  return sign === "-" && cents !== 0 ? -cents : cents;
}

/** Epoch seconds (number or numeric string) -> UTC `YYYY-MM-DD`, or null when not a usable timestamp. */
export function epochToDate(seconds: number | string | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds === "") return null;
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(Math.floor(n) * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  if (y < 1970 || y > 9999) return null;
  return `${String(y).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** A 3-letter currency code (upper-cased), otherwise "USD". */
export function normalizeCurrency(currency: unknown): string {
  if (typeof currency !== "string") return "USD";
  const upper = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : "USD";
}

// ---------------------------------------------------------------------------
// Sync window planning
// ---------------------------------------------------------------------------

export interface SyncWindow {
  /** Inclusive; always a UTC midnight. */
  start: Date;
  /** Exclusive. */
  end: Date;
  /** `YYYY-MM-DD` of `start`: stored non-pending transactions dated on/after this are replaced. */
  startDate: string;
}

/**
 * One request window (SimpleFIN allows at most 90 days per request):
 *   end   = now + 1 day (end-date is exclusive)
 *   start = lastSyncedAt - 7 days (late-posting transactions), or the maximum span on the
 *           first sync, never older than the maximum span, floored to UTC midnight.
 * The span is capped at 89 days before flooring, so the result is always at most 90 days.
 */
export function planSyncWindow(lastSyncedAt: Date | null, now: Date): SyncWindow {
  const endSec = Math.floor(now.getTime() / 1000) + DAY_SECONDS;
  const earliest = endSec - MAX_SPAN_DAYS * DAY_SECONDS;
  const desired = lastSyncedAt ? Math.floor(lastSyncedAt.getTime() / 1000) - 7 * DAY_SECONDS : earliest;
  const startSec = Math.floor(Math.min(Math.max(desired, earliest), endSec - DAY_SECONDS) / DAY_SECONDS) * DAY_SECONDS;
  const start = new Date(startSec * 1000);
  return { start, end: new Date(endSec * 1000), startDate: epochToDate(startSec) ?? "1970-01-01" };
}

// ---------------------------------------------------------------------------
// Account Set -> normalized rows
// ---------------------------------------------------------------------------

export interface NormalizedTransaction {
  providerTransactionId: string;
  date: string;
  /** Signed: money in positive, money out negative. */
  amountCents: number;
  description: string;
  pending: boolean;
}

export interface NormalizedAccount {
  providerAccountId: string;
  institutionName: string;
  name: string;
  currency: string;
  balanceCents: number;
  availableBalanceCents: number | null;
  balanceDate: string;
  /**
   * True when SimpleFIN reported an error for this account or its connection (errlist), so an empty
   * or short transaction list cannot be trusted. Callers must keep the stored transactions.
   */
  incomplete: boolean;
  transactions: NormalizedTransaction[];
}

export interface AccountSet {
  accounts: NormalizedAccount[];
  /** Display-only notices from SimpleFIN (errlist/errors) and from skipped data. Plain text. */
  warnings: string[];
}

const loose = z.union([z.string(), z.number()]);
const idLike = z.union([z.string().min(1), z.number()]).transform(String);

const rawTransaction = z
  .object({
    id: idLike,
    posted: loose.nullish(),
    amount: loose,
    description: z.string().nullish(),
    transacted_at: loose.nullish(),
    pending: z.boolean().nullish(),
  })
  .passthrough();

const rawAccount = z
  .object({
    id: idLike,
    name: z.string().nullish(),
    conn_id: z.string().nullish(),
    org: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    currency: z.string().nullish(),
    balance: loose,
    "available-balance": loose.nullish(),
    "balance-date": loose.nullish(),
    transactions: z.array(z.unknown()).nullish(),
  })
  .passthrough();

const rawAccountSet = z
  .object({
    errlist: z
      .array(z.object({ msg: z.string().nullish(), conn_id: z.string().nullish(), account_id: z.string().nullish() }).passthrough())
      .nullish(),
    errors: z.array(z.string()).nullish(),
    connections: z.array(z.object({ conn_id: z.string(), name: z.string().nullish() }).passthrough()).nullish(),
    accounts: z.array(z.unknown()).nullish(),
  })
  .passthrough();

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Validates and normalizes a SimpleFIN Account Set (`today` = YYYY-MM-DD fallback date
 * for transactions that have no usable timestamp). Throws a 502 only when the body is not
 * an Account Set at all; individual bad accounts/transactions are skipped with a warning.
 */
export function normalizeAccountSet(raw: unknown, today: string): AccountSet {
  const set = rawAccountSet.safeParse(raw);
  if (!set.success) {
    throw new ApiError(502, "UPSTREAM_ERROR", "SimpleFIN returned a response this app could not read. Try again later.");
  }

  const warnings: string[] = [];
  const addWarning = (msg: string | null | undefined) => {
    const text = clean(msg ?? "", MAX_WARNING_LENGTH);
    if (text && !warnings.includes(text) && warnings.length < MAX_WARNINGS) warnings.push(text);
  };

  // Prefer the structured list; older servers only send display strings.
  const errlist = set.data.errlist ?? [];
  for (const msg of errlist.length ? errlist.map((e) => e.msg) : (set.data.errors ?? [])) addWarning(msg);
  const failedConnections = new Set(errlist.map((e) => e.conn_id).filter((v): v is string => !!v));
  const failedAccounts = new Set(errlist.map((e) => e.account_id).filter((v): v is string => !!v));

  const connectionNames = new Map<string, string>();
  for (const c of set.data.connections ?? []) if (c.name) connectionNames.set(c.conn_id, c.name);

  const accounts: NormalizedAccount[] = [];
  const seenAccounts = new Set<string>();
  let skippedAccounts = 0;
  let skippedTransactions = 0;

  for (const item of set.data.accounts ?? []) {
    const parsed = rawAccount.safeParse(item);
    const balanceCents = parsed.success ? parseSignedDecimalToCents(parsed.data.balance) : null;
    if (!parsed.success || balanceCents === null || seenAccounts.has(parsed.data.id)) {
      skippedAccounts += 1;
      continue;
    }
    const a = parsed.data;
    seenAccounts.add(a.id);

    const available = a["available-balance"];
    const transactions: NormalizedTransaction[] = [];
    const seenTransactions = new Set<string>();
    for (const t of a.transactions ?? []) {
      const tx = rawTransaction.safeParse(t);
      const amountCents = tx.success ? parseSignedDecimalToCents(tx.data.amount) : null;
      if (!tx.success || amountCents === null) {
        skippedTransactions += 1;
        continue;
      }
      if (seenTransactions.has(tx.data.id)) continue;
      seenTransactions.add(tx.data.id);
      transactions.push({
        providerTransactionId: tx.data.id,
        date: epochToDate(tx.data.posted) ?? epochToDate(tx.data.transacted_at) ?? today,
        amountCents,
        description: clean(tx.data.description ?? "", MAX_DESCRIPTION_LENGTH) || "(no description)",
        pending: tx.data.pending === true,
      });
    }

    accounts.push({
      providerAccountId: a.id,
      institutionName: (a.conn_id && connectionNames.get(a.conn_id)) || a.org?.name || "Unknown institution",
      name: clean(a.name ?? "", 120) || "Account",
      currency: normalizeCurrency(a.currency),
      balanceCents,
      availableBalanceCents: available === null || available === undefined ? null : parseSignedDecimalToCents(available),
      balanceDate: epochToDate(a["balance-date"]) ?? today,
      incomplete: failedAccounts.has(a.id) || (!!a.conn_id && failedConnections.has(a.conn_id)),
      transactions,
    });
  }

  if (skippedAccounts > 0) {
    addWarning(`Skipped ${skippedAccounts} account${skippedAccounts === 1 ? "" : "s"} that SimpleFIN reported with unreadable data.`);
  }
  if (skippedTransactions > 0) {
    addWarning(`Skipped ${skippedTransactions} transaction${skippedTransactions === 1 ? "" : "s"} with unreadable amounts.`);
  }
  return { accounts, warnings };
}
