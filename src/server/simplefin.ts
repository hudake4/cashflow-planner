/**
 * SimpleFIN Bridge client. This is the ONLY module that handles setup tokens and access
 * URLs (docs/CONVENTIONS.md section 9). It never logs them and never puts them, or the
 * Authorization header, into an error message. Failures become `ApiError`s.
 *
 * Rate limits matter: SimpleFIN allows 24 requests/day per token and disables abusive
 * ones, so callers fetch only on explicit user action (see the institutions repository).
 */
import { ApiError } from "./http";
import {
  buildAccountsUrl,
  decodeSetupToken,
  isValidAccessUrl,
  mapHttpFailure,
  normalizeAccountSet,
  parseAccessUrl,
  unavailable,
  type AccountSet,
} from "./simplefin-mapping";

export type { AccountSet } from "./simplefin-mapping";

const TIMEOUT_MS = 20_000;

/** fetch with a timeout and no redirects; any network failure becomes a generic 502 (no URL in the message). */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw unavailable();
  }
}

/**
 * Exchanges a setup token for an Access URL (the credentials for this connection).
 * A token can be claimed only once. Validates the token's host before any network call.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  const res = await send(claimUrl, { method: "POST" });
  if (res.status !== 200) throw mapHttpFailure("claim", res.status);

  const accessUrl = (await res.text().catch(() => "")).trim();
  if (!isValidAccessUrl(accessUrl)) {
    throw new ApiError(502, "UPSTREAM_ERROR", "SimpleFIN returned an unexpected response to the setup token. Try creating a new token.");
  }
  return accessUrl;
}

export interface FetchAccountSetOptions {
  /** Inclusive. */
  start: Date;
  /** Exclusive. At most 90 days after `start`. */
  end: Date;
  pending: boolean;
  /** `YYYY-MM-DD` used for transactions without a usable timestamp. */
  today: string;
}

/** Fetches accounts, balances and transactions for the window using HTTP Basic auth. */
export async function fetchAccountSet(accessUrl: string, options: FetchAccountSetOptions): Promise<AccountSet> {
  const { baseUrl, authorization } = parseAccessUrl(accessUrl);
  const res = await send(buildAccountsUrl(baseUrl, options), {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (res.status !== 200) throw mapHttpFailure("fetch", res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(502, "UPSTREAM_ERROR", "SimpleFIN returned a response this app could not read. Try again later.");
  }
  return normalizeAccountSet(body, options.today);
}
