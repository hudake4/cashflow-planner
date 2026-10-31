/**
 * When bank connections refresh by themselves. Pure, so it can be tested without a clock.
 *
 * Once a day, at AUTO_SYNC_HOUR local time, every connection whose last successful sync is
 * older than that moment is due. Checking "is there a missed 4am?" instead of "is it 4am?"
 * means a computer that was off or asleep at 4am catches up when the app runs again.
 */

/** Local hour of day (0-23) of the daily automatic refresh. */
export const AUTO_SYNC_HOUR = 4;

/** The most recent AUTO_SYNC_HOUR:00 local time at or before `now`. */
export function latestAutoSyncSlot(now: Date): Date {
  const slot = new Date(now);
  slot.setHours(AUTO_SYNC_HOUR, 0, 0, 0);
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1);
  return slot;
}

/** True when the connection has never synced or its last successful sync is before `slot`. */
export function isAutoSyncDue(lastSyncedAt: Date | null, slot: Date): boolean {
  return lastSyncedAt === null || lastSyncedAt.getTime() < slot.getTime();
}
