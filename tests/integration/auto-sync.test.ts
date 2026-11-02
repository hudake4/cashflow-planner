import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newAutoSyncState, runAutoSync } from "@/server/auto-sync";
import { HOUSEHOLD_ID } from "@/server/db";
import * as simplefin from "@/server/simplefin";
import { normalizeAccountSet } from "@/server/simplefin-mapping";
import { testPrisma } from "../setup/integration-setup";

vi.mock("@/server/simplefin", () => ({
  claimSetupToken: vi.fn(),
  fetchAccountSet: vi.fn(),
}));
const mocked = vi.mocked(simplefin);

const ACCESS_URL = "https://demouser:pw@bridge.simplefin.org/simplefin";
// Local-time constructor: the schedule is the user's local 4am, whatever the machine's zone.
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute);

const addConnection = (lastSyncedAt: Date | null) =>
  testPrisma.bankConnection.create({ data: { householdId: HOUSEHOLD_ID, accessUrl: ACCESS_URL, lastSyncedAt } });
const lastSynced = async (id: string) => (await testPrisma.bankConnection.findUniqueOrThrow({ where: { id } })).lastSyncedAt;

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(10, 31, 4, 30));
  vi.resetAllMocks();
  mocked.fetchAccountSet.mockResolvedValue(normalizeAccountSet({ errlist: [], connections: [], accounts: [] }, "2026-10-31"));
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  errorLog.mockRestore();
});

describe("runAutoSync", () => {
  it("refreshes a connection last synced before today's 4am", async () => {
    const conn = await addConnection(at(10, 30, 10, 0));
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(1);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1);
    expect(mocked.fetchAccountSet.mock.calls[0][0]).toBe(ACCESS_URL);
    expect(await lastSynced(conn.id)).toEqual(at(10, 31, 4, 30));
  });

  it("refreshes a connection that never synced", async () => {
    await addConnection(null);
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(1);
  });

  it("leaves a connection alone when it already synced since 4am", async () => {
    const conn = await addConnection(at(10, 31, 4, 10));
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(0);
    expect(mocked.fetchAccountSet).not.toHaveBeenCalled();
    expect(await lastSynced(conn.id)).toEqual(at(10, 31, 4, 10));
  });

  it("waits for 4am: before it, the previous day's sync is still current", async () => {
    vi.setSystemTime(at(10, 31, 3, 30));
    await addConnection(at(10, 30, 10, 0));
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(0);
    expect(mocked.fetchAccountSet).not.toHaveBeenCalled();
  });

  it("catches up when the app was closed at 4am and starts later in the day", async () => {
    vi.setSystemTime(at(10, 31, 18, 45));
    await addConnection(at(10, 30, 10, 0));
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(1);
  });

  it("handles each slot once per process", async () => {
    await addConnection(at(10, 30, 10, 0));
    const state = newAutoSyncState();
    expect(await runAutoSync(new Date(), state)).toBe(1);
    expect(await runAutoSync(new Date(), state)).toBe(0);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1);

    // The next day's 4am is a new slot.
    vi.setSystemTime(at(11, 1, 4, 5));
    expect(await runAutoSync(new Date(), state)).toBe(1);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed refresh within the same slot, and does not throw", async () => {
    const conn = await addConnection(at(10, 30, 10, 0));
    const state = newAutoSyncState();
    mocked.fetchAccountSet.mockRejectedValue(new Error("bank is down"));

    expect(await runAutoSync(new Date(), state)).toBe(0);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(await lastSynced(conn.id)).toEqual(at(10, 30, 10, 0));

    vi.setSystemTime(at(10, 31, 4, 31));
    expect(await runAutoSync(new Date(), state)).toBe(0);
    expect(mocked.fetchAccountSet).toHaveBeenCalledTimes(1);

    // The next slot tries again.
    mocked.fetchAccountSet.mockResolvedValue(normalizeAccountSet({ errlist: [], connections: [], accounts: [] }, "2026-11-01"));
    vi.setSystemTime(at(11, 1, 4, 0));
    expect(await runAutoSync(new Date(), state)).toBe(1);
  });

  it("keeps going after one connection fails", async () => {
    const first = await addConnection(at(10, 30, 10, 0));
    const second = await addConnection(at(10, 30, 11, 0));
    mocked.fetchAccountSet.mockRejectedValueOnce(new Error("bank is down"));

    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(1);
    expect(await lastSynced(first.id)).toEqual(at(10, 30, 10, 0));
    expect(await lastSynced(second.id)).toEqual(at(10, 31, 4, 30));
  });

  it("does nothing when no bank is connected", async () => {
    expect(await runAutoSync(new Date(), newAutoSyncState())).toBe(0);
    expect(mocked.fetchAccountSet).not.toHaveBeenCalled();
  });
});
