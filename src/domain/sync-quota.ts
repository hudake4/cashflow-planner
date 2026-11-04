/**
 * How many of SimpleFIN's daily requests a connection has used. Pure, so it can be tested without a clock.
 *
 * SimpleFIN allows SYNC_REQUEST_LIMIT requests per token per day and disables a token that goes over.
 * It does not say where its day starts, so the app counts a rolling window ending now: if at most
 * 24 requests fall in any 24 hours, no calendar day can hold more than 24 either.
 */
import { SYNC_REQUEST_LIMIT, SYNC_REQUEST_WINDOW_HOURS, type SyncQuotaDTO } from "../contracts/api";

export const SYNC_REQUEST_WINDOW_MS = SYNC_REQUEST_WINDOW_HOURS * 3_600_000;

/** The start of the window ending at `now`. A request made exactly this long ago no longer counts. */
export const syncWindowStart = (now: Date): Date => new Date(now.getTime() - SYNC_REQUEST_WINDOW_MS);

/**
 * Counts the requests inside the window. `resetsAt` is when the oldest of them ages out, so the
 * count drops by one; null when there are none.
 */
export function summarizeSyncQuota(requestedAt: readonly Date[], now: Date): SyncQuotaDTO {
  const since = syncWindowStart(now).getTime();
  const inWindow = requestedAt.map((d) => d.getTime()).filter((t) => t > since);
  return {
    used: inWindow.length,
    limit: SYNC_REQUEST_LIMIT,
    resetsAt: inWindow.length ? new Date(Math.min(...inWindow) + SYNC_REQUEST_WINDOW_MS).toISOString() : null,
  };
}
