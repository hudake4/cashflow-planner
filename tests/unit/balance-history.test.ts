import { describe, expect, it } from "vitest";
import { buildBalanceHistory, type HistoryAccount } from "@/domain/balance-history";

const account = (over: Partial<HistoryAccount> = {}): HistoryAccount => ({
  balanceCents: 100_000,
  balanceDate: "2026-11-02",
  coverageStart: "2026-08-01",
  transactions: [],
  ...over,
});

const balances = (accounts: HistoryAccount[], from: string, to: string) =>
  Object.fromEntries(buildBalanceHistory(accounts, from, to).days.map((d) => [d.date, d.closingBalanceCents]));

describe("buildBalanceHistory", () => {
  it("works backward from the balance, undoing the transactions dated after each day", () => {
    const a = account({
      transactions: [
        { date: "2026-11-02", amountCents: -2_500 }, // spent today
        { date: "2026-11-01", amountCents: 50_000 }, // paycheck yesterday
        { date: "2026-10-30", amountCents: -10_000 },
      ],
    });
    expect(balances([a], "2026-10-29", "2026-11-01")).toEqual({
      "2026-11-01": 102_500, // 100,000 + the 2,500 spent on the 2nd
      "2026-10-31": 52_500, // before the paycheck
      "2026-10-30": 52_500, // the 30th's bill is already out by the end of that day
      "2026-10-29": 62_500, // 10,000 more before it
    });
  });

  it("holds the balance flat on days with no transactions", () => {
    expect(balances([account()], "2026-10-25", "2026-11-01")).toEqual(
      Object.fromEntries(["25", "26", "27", "28", "29", "30", "31"].map((d) => [`2026-10-${d}`, 100_000]).concat([["2026-11-01", 100_000]])),
    );
  });

  it("ignores transactions dated after the balance date", () => {
    const a = account({ balanceDate: "2026-11-01", transactions: [{ date: "2026-11-02", amountCents: -9_999 }] });
    expect(balances([a], "2026-10-31", "2026-11-01")).toEqual({ "2026-10-31": 100_000, "2026-11-01": 100_000 });
  });

  it("uses an account's balance unchanged for the days after its balance date", () => {
    const stale = account({ balanceCents: 40_000, balanceDate: "2026-10-30", transactions: [{ date: "2026-10-30", amountCents: -1_000 }] });
    const fresh = account({ balanceCents: 60_000, transactions: [{ date: "2026-11-02", amountCents: -5_000 }] });
    expect(balances([stale, fresh], "2026-10-30", "2026-11-01")).toEqual({
      "2026-10-30": 40_000 + 65_000,
      "2026-10-31": 40_000 + 65_000,
      "2026-11-01": 40_000 + 65_000,
    });
  });

  it("sums the accounts and handles overdrawn balances", () => {
    const checking = account({ balanceCents: 10_000, transactions: [{ date: "2026-11-01", amountCents: -30_000 }] });
    const savings = account({ balanceCents: 500_000 });
    expect(balances([checking, savings], "2026-10-31", "2026-10-31")).toEqual({ "2026-10-31": 540_000 });
  });

  it("starts at the newest account's coverage, because older days would be missing its transactions", () => {
    const old = account({ coverageStart: "2026-06-01" });
    const young = account({ coverageStart: "2026-10-20" });
    const result = buildBalanceHistory([old, young], "2026-10-01", "2026-10-25");
    expect(result.coverageStart).toBe("2026-10-20");
    expect(result.days[0].date).toBe("2026-10-20");
    expect(result.days).toHaveLength(6);
  });

  it("returns no days when the whole range is before coverage, or there are no accounts", () => {
    expect(buildBalanceHistory([account({ coverageStart: "2026-10-20" })], "2026-10-01", "2026-10-10")).toEqual({
      days: [],
      coverageStart: "2026-10-20",
    });
    expect(buildBalanceHistory([], "2026-10-01", "2026-10-10")).toEqual({ days: [], coverageStart: null });
  });

  it("counts transactions after the range end when working back to an earlier day", () => {
    const a = account({ transactions: [{ date: "2026-10-31", amountCents: -4_000 }, { date: "2026-10-29", amountCents: 1_000 }] });
    expect(balances([a], "2026-10-28", "2026-10-28")).toEqual({ "2026-10-28": 100_000 + 4_000 - 1_000 });
  });
});
