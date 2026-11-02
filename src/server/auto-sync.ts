/**
 * Daily automatic refresh of the bank connections (see domain/auto-sync.ts for the schedule).
 *
 * Started once per server process from instrumentation.ts, so it runs wherever the app
 * does: `npm run dev`, `npm start` and the desktop app. It checks the clock every minute but
 * only reads the database once per slot, and it tries each slot once: a failed refresh is
 * not retried until the next slot (or the next launch), so SimpleFIN's 24 requests/day
 * limit can never be approached by a retry loop. The 15 minute rule in syncConnection
 * still applies.
 */
import { isAutoSyncDue, latestAutoSyncSlot } from "../domain/auto-sync";
import { db, HOUSEHOLD_ID } from "./db";
import { ApiError } from "./http";
import { syncConnection } from "./repositories/institutions";

const CHECK_INTERVAL_MS = 60_000;
/** Lets the app finish starting (and the user see it) before the first catch-up check. */
const FIRST_CHECK_DELAY_MS = 15_000;

export interface AutoSyncState {
  /** Start time of the last slot that was fully handled in this process. */
  handledSlot: number | null;
  running: boolean;
}

export const newAutoSyncState = (): AutoSyncState => ({ handledSlot: null, running: false });

/**
 * Refreshes every connection that is due for the current slot, one after the other.
 * Returns how many refreshed successfully. Never throws: failures are logged and skipped.
 */
export async function runAutoSync(now: Date, state: AutoSyncState): Promise<number> {
  const slot = latestAutoSyncSlot(now);
  if (state.running || state.handledSlot === slot.getTime()) return 0;
  state.running = true;
  let refreshed = 0;
  try {
    const rows = await db.bankConnection.findMany({
      where: { householdId: HOUSEHOLD_ID },
      select: { id: true, lastSyncedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const row of rows) {
      if (!isAutoSyncDue(row.lastSyncedAt, slot)) continue;
      try {
        await syncConnection(row.id, new Date());
        refreshed += 1;
      } catch (err) {
        // ApiError messages are written for the user; anything else may carry URLs, so log only its type.
        console.error("[auto-sync] refresh failed:", err instanceof ApiError ? err.message : err instanceof Error ? err.name : "unknown error");
      }
    }
    state.handledSlot = slot.getTime();
  } catch (err) {
    console.error("[auto-sync] could not read connections:", err instanceof Error ? err.name : "unknown error");
  } finally {
    state.running = false;
  }
  return refreshed;
}

const globalForAutoSync = globalThis as unknown as { __cashflowAutoSync?: true };

/** Starts the daily refresh timer. Safe to call twice; the timers never keep the process alive. */
export function startAutoSync(): void {
  if (globalForAutoSync.__cashflowAutoSync) return;
  globalForAutoSync.__cashflowAutoSync = true;

  const state = newAutoSyncState();
  const check = () => void runAutoSync(new Date(), state);
  setTimeout(check, FIRST_CHECK_DELAY_MS).unref();
  setInterval(check, CHECK_INTERVAL_MS).unref();
}
