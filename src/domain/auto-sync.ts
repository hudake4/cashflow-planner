/**
 * When bank connections refresh by themselves. Pure, so it can be tested without a clock.
 *
 * Every AUTO_SYNC_INTERVAL_HOURS hours, on the hour counted from local midnight (12:00 am,
 * 2:00 am, 4:00 am ...), every connection whose last successful sync is older than that
 * moment is due. Checking "is there a missed slot?" instead of "is it a slot?" means a
 * computer that was off or asleep at the slot catches up when the app runs again.
 */

/** Hours between automatic refreshes. Must divide 24, so every day has the same slots. */
export const AUTO_SYNC_INTERVAL_HOURS = 2;

/** A connection refreshed within this many minutes before a slot is left for the next slot. */
export const AUTO_SYNC_RECENT_MINUTES = 30;

/** The most recent slot (a local hour that is a multiple of the interval) at or before `now`. */
export function latestAutoSyncSlot(now: Date): Date {
  const slot = new Date(now);
  slot.setHours(now.getHours() - (now.getHours() % AUTO_SYNC_INTERVAL_HOURS), 0, 0, 0);
  return slot;
}

/**
 * True when the connection has never synced or its last successful sync is older than the slot
 * by more than AUTO_SYNC_RECENT_MINUTES. The grace keeps a manual refresh just before a slot
 * from being repeated a minute later (it would also spend one of SimpleFIN's 24 daily requests).
 */
export function isAutoSyncDue(lastSyncedAt: Date | null, slot: Date): boolean {
  return lastSyncedAt === null || lastSyncedAt.getTime() < slot.getTime() - AUTO_SYNC_RECENT_MINUTES * 60_000;
}
