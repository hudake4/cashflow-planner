import { describe, expect, it } from "vitest";
import { AUTO_SYNC_HOUR, isAutoSyncDue, latestAutoSyncSlot } from "@/domain/auto-sync";

// Local-time constructors: the schedule is the user's local 4am, whatever the machine's zone.
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute);

describe("latestAutoSyncSlot", () => {
  it("runs at 4am local time", () => {
    expect(AUTO_SYNC_HOUR).toBe(4);
  });

  it("is today's 4am once it has passed", () => {
    expect(latestAutoSyncSlot(at(10, 31, 4, 0))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 4, 1))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 23, 59))).toEqual(at(10, 31, 4, 0));
  });

  it("is yesterday's 4am before today's", () => {
    expect(latestAutoSyncSlot(at(10, 31, 3, 59))).toEqual(at(10, 30, 4, 0));
    expect(latestAutoSyncSlot(at(10, 31, 0, 0))).toEqual(at(10, 30, 4, 0));
  });

  it("crosses month and year boundaries", () => {
    expect(latestAutoSyncSlot(at(11, 1, 2, 0))).toEqual(at(10, 31, 4, 0));
    expect(latestAutoSyncSlot(new Date(2027, 0, 1, 1, 0))).toEqual(new Date(2026, 11, 31, 4, 0));
  });
});

describe("isAutoSyncDue", () => {
  const slot = at(10, 31, 4, 0);

  it("is due when never synced", () => {
    expect(isAutoSyncDue(null, slot)).toBe(true);
  });

  it("is due when the last sync was before the slot", () => {
    expect(isAutoSyncDue(at(10, 30, 21, 0), slot)).toBe(true);
    expect(isAutoSyncDue(at(10, 31, 3, 59), slot)).toBe(true);
  });

  it("is not due when the last sync was at or after the slot", () => {
    expect(isAutoSyncDue(at(10, 31, 4, 0), slot)).toBe(false);
    expect(isAutoSyncDue(at(10, 31, 9, 15), slot)).toBe(false);
  });
});
