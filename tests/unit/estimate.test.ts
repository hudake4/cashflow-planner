import { describe, expect, it } from "vitest";
import { estimateBillAmount, type EstimateInput } from "@/domain/estimate";
import type { ScanTransaction } from "@/domain/recurring";

const TODAY = "2026-10-24";
const HISTORY_START = "2026-07-28";

const tx = (date: string, description: string, amountCents: number): ScanTransaction => ({ date, description, amountCents });
const run = (transactions: ScanTransaction[], over: Partial<EstimateInput> = {}) =>
  estimateBillAmount({
    billName: "Electric",
    frequency: "MONTHLY",
    anchorDate: "2026-08-15",
    dueDate: "2026-11-15",
    transactions,
    today: TODAY,
    historyStart: HISTORY_START,
    ...over,
  });

describe("estimateBillAmount: no suggestion", () => {
  it("has nothing to say without any matching payment", () => {
    expect(run([tx("2026-09-10", "KROGER 123", -5000)])).toEqual({ estimate: null, reason: "NO_MATCHES" });
    expect(run([])).toEqual({ estimate: null, reason: "NO_MATCHES" });
  });

  it("ignores money in (a refund is not a payment)", () => {
    expect(run([tx("2026-09-10", "City Electric refund", 5000)])).toEqual({ estimate: null, reason: "NO_MATCHES" });
  });

  it("needs two complete periods", () => {
    expect(run([tx("2026-09-10", "CITY ELECTRIC", -9000)])).toEqual({ estimate: null, reason: "TOO_FEW_PERIODS" });
  });

  it("does not count the month in progress or one cut off by the start of the history", () => {
    const out = run([
      tx("2026-07-30", "CITY ELECTRIC", -9000), // July started before the history did
      tx("2026-09-10", "CITY ELECTRIC", -9000),
      tx("2026-10-10", "CITY ELECTRIC", -9000), // October is not over
    ]);
    expect(out).toEqual({ estimate: null, reason: "TOO_FEW_PERIODS" });
  });

  it("does not estimate quarterly, yearly or one-time bills", () => {
    for (const frequency of ["QUARTERLY", "YEARLY", "ONE_TIME"] as const) {
      expect(run([tx("2026-09-10", "CITY ELECTRIC", -9000)], { frequency })).toEqual({ estimate: null, reason: "UNSUPPORTED_FREQUENCY" });
    }
  });
});

describe("estimateBillAmount: rolling average", () => {
  it("averages the complete months, adding up several payments in one month", () => {
    const out = run([
      tx("2026-08-12", "CITY ELECTRIC 1111", -8000),
      tx("2026-09-05", "CITY ELECTRIC 2222", -6000),
      tx("2026-09-20", "CITY ELECTRIC 3333", -4000),
    ]);
    expect(out).toEqual({
      estimate: { amountCents: 9000, method: "ROLLING", periodCount: 2, firstDate: "2026-08-12", lastDate: "2026-09-20" },
      reason: null,
    });
  });

  it("matches the bill's name against the bank description, ignoring case and reference numbers", () => {
    const out = run([tx("2026-08-12", "POS DEBIT city electric #8841", -8000), tx("2026-09-12", "City Electric Co ACH 99", -9000)], {
      billName: "City Electric",
    });
    expect(out.estimate?.amountCents).toBe(8500);
  });

  it("rounds to whole cents", () => {
    // (10001 + 10002 + 10002) / 3 = 10001.67 -> 10002
    const out = run(
      [tx("2026-08-12", "CITY ELECTRIC", -10001), tx("2026-09-12", "CITY ELECTRIC", -10002), tx("2026-06-12", "CITY ELECTRIC", -10002)],
      { historyStart: "2026-06-01" },
    );
    expect(out.estimate).toMatchObject({ amountCents: 10002, periodCount: 3 });
  });

  it("uses only the latest four periods", () => {
    const out = run(
      [
        tx("2026-02-10", "CITY ELECTRIC", -90000),
        tx("2026-03-10", "CITY ELECTRIC", -10000),
        tx("2026-04-10", "CITY ELECTRIC", -12000),
        tx("2026-05-10", "CITY ELECTRIC", -14000),
        tx("2026-06-10", "CITY ELECTRIC", -16000),
      ],
      { historyStart: "2026-01-01", dueDate: "2026-11-15" },
    );
    expect(out.estimate).toMatchObject({ amountCents: 13000, periodCount: 4, firstDate: "2026-03-10", lastDate: "2026-06-10" });
  });

  it("leaves out an outlier period when there are three or more", () => {
    const out = run(
      [
        tx("2026-06-10", "CITY ELECTRIC", -10000),
        tx("2026-07-10", "CITY ELECTRIC", -11000),
        tx("2026-08-10", "CITY ELECTRIC", -60000), // catch-up payment
        tx("2026-09-10", "CITY ELECTRIC", -12000),
      ],
      { historyStart: "2026-06-01" },
    );
    expect(out.estimate).toMatchObject({ amountCents: 11000, periodCount: 3 });
  });

  it("keeps both periods when there are only two, however different", () => {
    const out = run([tx("2026-08-10", "CITY ELECTRIC", -1000), tx("2026-09-10", "CITY ELECTRIC", -9000)]);
    expect(out.estimate).toMatchObject({ amountCents: 5000, periodCount: 2 });
  });

  it("ignores payments dated after today", () => {
    const out = run([tx("2026-08-10", "CITY ELECTRIC", -8000), tx("2026-09-10", "CITY ELECTRIC", -9000), tx("2026-11-02", "CITY ELECTRIC", -99999)]);
    expect(out.estimate).toMatchObject({ amountCents: 8500, lastDate: "2026-09-10" });
  });
});

describe("estimateBillAmount: weekly and every-2-weeks bills", () => {
  // Anchor Sat 2026-10-03: weeks run Sat-Fri, so the one starting 10-17 ends 10-23 (complete) and 10-24 starts a new one.
  const grocer = (date: string, cents: number) => tx(date, "KROGER #1234", -cents);

  it("averages complete weeks counted from the bill's anchor date", () => {
    const out = run(
      [grocer("2026-10-03", 5000), grocer("2026-10-06", 2000), grocer("2026-10-10", 9000), grocer("2026-10-17", 7000), grocer("2026-10-24", 99999)],
      { billName: "Kroger", frequency: "WEEKLY", anchorDate: "2026-10-03", dueDate: "2026-10-31" },
    );
    // Weeks: 10-03 -> 7000, 10-10 -> 9000, 10-17 -> 7000; the week starting 10-24 is still running.
    expect(out.estimate).toMatchObject({ amountCents: 7667, method: "ROLLING", periodCount: 3 });
  });

  it("groups into two-week periods", () => {
    const out = run(
      [grocer("2026-09-19", 4000), grocer("2026-09-30", 6000), grocer("2026-10-03", 8000), grocer("2026-10-14", 2000)],
      { billName: "Kroger", frequency: "BIWEEKLY", anchorDate: "2026-09-19", dueDate: "2026-10-31" },
    );
    // 09-19..10-02 -> 10000, 10-03..10-16 -> 10000, 10-17..10-30 still running (empty).
    expect(out.estimate).toMatchObject({ amountCents: 10000, periodCount: 2 });
  });
});

describe("estimateBillAmount: seasonal", () => {
  const history = [
    tx("2025-11-10", "CITY ELECTRIC", -7000),
    tx("2025-12-10", "CITY ELECTRIC", -12000),
    tx("2026-08-10", "CITY ELECTRIC", -20000),
    tx("2026-09-10", "CITY ELECTRIC", -18000),
  ];

  it("uses the same month of an earlier year when the history reaches back that far", () => {
    const out = run(history, { historyStart: "2025-01-01", dueDate: "2026-12-15" });
    expect(out).toEqual({
      estimate: { amountCents: 12000, method: "SEASONAL", periodCount: 1, firstDate: "2025-12-10", lastDate: "2025-12-10" },
      reason: null,
    });
  });

  it("falls back to the rolling average when no earlier year has that month", () => {
    const out = run(history, { historyStart: "2025-01-01", dueDate: "2026-07-15" });
    expect(out.estimate).toMatchObject({ method: "ROLLING" });
  });

  it("is never used for a short history (the 89-day window), whatever the month", () => {
    const out = run(history.slice(2), { dueDate: "2026-12-15" });
    expect(out.estimate).toMatchObject({ method: "ROLLING", amountCents: 19000, periodCount: 2 });
  });

  it("is not used for weekly bills", () => {
    const out = run([tx("2025-11-10", "CITY ELECTRIC", -1000), tx("2026-09-01", "CITY ELECTRIC", -2000), tx("2026-09-08", "CITY ELECTRIC", -4000)], {
      frequency: "WEEKLY",
      anchorDate: "2026-09-01",
      historyStart: "2025-01-01",
      dueDate: "2026-11-10",
    });
    expect(out.estimate).toMatchObject({ method: "ROLLING" });
  });
});
