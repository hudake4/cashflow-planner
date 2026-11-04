import { describe, expect, it } from "vitest";
import { SYNC_REQUEST_LIMIT } from "@/contracts/api";
import { summarizeSyncQuota, syncWindowStart } from "@/domain/sync-quota";

const now = new Date("2026-11-03T12:00:00.000Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("summarizeSyncQuota", () => {
  it("allows 24 requests per token", () => {
    expect(SYNC_REQUEST_LIMIT).toBe(24);
  });

  it("is empty with no requests", () => {
    expect(summarizeSyncQuota([], now)).toEqual({ used: 0, limit: 24, resetsAt: null });
  });

  it("counts the requests of the last 24 hours and says when the oldest ages out", () => {
    const quota = summarizeSyncQuota([ago(1), ago(5), ago(23)], now);
    expect(quota).toEqual({ used: 3, limit: 24, resetsAt: ago(-1).toISOString() });
  });

  it("stops counting a request exactly 24 hours old", () => {
    expect(syncWindowStart(now)).toEqual(ago(24));
    expect(summarizeSyncQuota([ago(24), ago(25), ago(1)], now).used).toBe(1);
    expect(summarizeSyncQuota([ago(23.99)], now).used).toBe(1);
  });

  it("still counts a request stamped in the future (a clock that moved back)", () => {
    expect(summarizeSyncQuota([ago(-1)], now).used).toBe(1);
  });
});
