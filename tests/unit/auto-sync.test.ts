import { describe, expect, it } from "vitest";
import { AUTO_SYNC_INTERVAL_HOURS, AUTO_SYNC_RECENT_MINUTES, isAutoSyncDue, latestAutoSyncSlot } from "@/domain/auto-sync";

// Local-time constructors: the schedule is the user's local clock, whatever the machine's zone.
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute);

describe("latestAutoSyncSlot", () => {
  it("runs every 2 hours, which leaves half of SimpleFIN's 24 daily requests for the user", () => {
    expect(AUTO_SYNC_INTERVAL_HOURS).toBe(2);
    expect(24 % AUTO_SYNC_INTERVAL_HOURS).toBe(0);
  });

  it("is the even hour once it has started", () => {
    expect(latestAutoSyncSlot(at(10, 31, 4, 0))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 4, 1))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 5, 59))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 23, 59))).toEqual(at(10, 31, 22, 0));
  });

  it("is the previous even hour before the next one", () => {
    expect(latestAutoSyncSlot(at(10, 31, 3, 59))).toEqual(at(10, 31, 2, 0));
    expect(latestAutoSyncSlot(at(10, 31, 0, 0))).toEqual(at(10, 31, 0, 0));
    expect(latestAutoSyncSlot(at(10, 31, 1, 30))).toEqual(at(10, 31, 0, 0));
  });

  it("has 12 distinct slots in a day", () => {
    const slots = new Set<number>();
    for (let hour = 0; hour < 24; hour++) slots.add(latestAutoSyncSlot(at(10, 31, hour, 30)).getTime());
    expect(slots.size).toBe(12);
  });
});

describe("isAutoSyncDue", () => {
  const slot = at(10, 31, 4, 0);

  it("is due when never synced", () => {
    expect(isAutoSyncDue(null, slot)).toBe(true);
  });

  it("is due when the last sync was before the slot by more than the grace", () => {
    expect(AUTO_SYNC_RECENT_MINUTES).toBe(30);
    expect(isAutoSyncDue(at(10, 30, 21, 0), slot)).toBe(true);
    expect(isAutoSyncDue(at(10, 31, 2, 0), slot)).toBe(true);
    expect(isAutoSyncDue(at(10, 31, 3, 29), slot)).toBe(true);
  });

  it("is not due when the last sync was at or after the slot, or just before it", () => {
    expect(isAutoSyncDue(at(10, 31, 3, 30), slot)).toBe(false);
    expect(isAutoSyncDue(at(10, 31, 3, 59), slot)).toBe(false);
    expect(isAutoSyncDue(at(10, 31, 4, 0), slot)).toBe(false);
    expect(isAutoSyncDue(at(10, 31, 5, 15), slot)).toBe(false);
  });
});
