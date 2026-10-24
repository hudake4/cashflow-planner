import { describe, expect, it } from "vitest";
import { generateOccurrences, isScheduledOn, type Schedule } from "@/domain/recurrence";
import { oracleAddDays, oracleIsScheduled } from "../helpers/invariants";
import { rng } from "../helpers/fixtures";

const s = (frequency: Schedule["frequency"], anchorDate: string, endDate: string | null = null): Schedule => ({
  frequency,
  anchorDate,
  endDate,
});

describe("WEEKLY / BIWEEKLY (anchor + 7k / 14k days)", () => {
  it("weekly every 7 days from the anchor", () => {
    // anchor Fri 2025-01-03: Jan 3, 10, 17, 24, 31
    expect(generateOccurrences(s("WEEKLY", "2025-01-03"), "2025-01-01", "2025-01-31")).toEqual([
      "2025-01-03",
      "2025-01-10",
      "2025-01-17",
      "2025-01-24",
      "2025-01-31",
    ]);
  });

  it("biweekly every 14 days, never weekly", () => {
    expect(generateOccurrences(s("BIWEEKLY", "2025-01-03"), "2025-01-01", "2025-01-31")).toEqual([
      "2025-01-03",
      "2025-01-17",
      "2025-01-31",
    ]);
    expect(isScheduledOn(s("BIWEEKLY", "2025-01-03"), "2025-01-10")).toBe(false);
  });

  it("an old anchor stays phase-aligned (2024-01-05 + 26*14 = 2025-01-03)", () => {
    expect(generateOccurrences(s("BIWEEKLY", "2024-01-05"), "2025-01-01", "2025-01-31")).toEqual([
      "2025-01-03",
      "2025-01-17",
      "2025-01-31",
    ]);
    // weekly anchor from 2000 still lands on Fridays
    const w = generateOccurrences(s("WEEKLY", "2000-01-07"), "2025-01-01", "2025-01-14");
    expect(w).toEqual(["2025-01-03", "2025-01-10"]);
  });

  it("crosses DST and year boundaries without drift", () => {
    const w = generateOccurrences(s("WEEKLY", "2025-03-02"), "2025-03-01", "2025-04-06");
    expect(w).toEqual(["2025-03-02", "2025-03-09", "2025-03-16", "2025-03-23", "2025-03-30", "2025-04-06"]);
    expect(generateOccurrences(s("BIWEEKLY", "2025-12-26"), "2025-12-01", "2026-01-31")).toEqual([
      "2025-12-26",
      "2026-01-09",
      "2026-01-23",
    ]);
  });
});

describe("MONTHLY / QUARTERLY / YEARLY month-end policy", () => {
  it("anchor Jan 31 -> last day of shorter months, back to 31 (no drift)", () => {
    expect(generateOccurrences(s("MONTHLY", "2025-01-31"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
      "2025-05-31",
      "2025-06-30",
      "2025-07-31",
      "2025-08-31",
      "2025-09-30",
      "2025-10-31",
      "2025-11-30",
      "2025-12-31",
    ]);
  });

  it("anchor the 30th and the 29th", () => {
    expect(generateOccurrences(s("MONTHLY", "2025-01-30"), "2025-01-01", "2025-04-30")).toEqual([
      "2025-01-30",
      "2025-02-28",
      "2025-03-30",
      "2025-04-30",
    ]);
    expect(generateOccurrences(s("MONTHLY", "2025-01-29"), "2025-01-01", "2025-03-31")).toEqual([
      "2025-01-29",
      "2025-02-28",
      "2025-03-29",
    ]);
    expect(generateOccurrences(s("MONTHLY", "2024-01-29"), "2024-02-01", "2024-02-29")).toEqual(["2024-02-29"]);
  });

  it("leap years: monthly Jan 31 2028 -> Feb 29; yearly Feb 29 -> Feb 28 / Feb 29", () => {
    expect(generateOccurrences(s("MONTHLY", "2028-01-31"), "2028-02-01", "2028-03-31")).toEqual([
      "2028-02-29",
      "2028-03-31",
    ]);
    expect(generateOccurrences(s("YEARLY", "2024-02-29"), "2024-01-01", "2029-12-31")).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
      "2029-02-28",
    ]);
  });

  it("quarterly from the anchor", () => {
    expect(generateOccurrences(s("QUARTERLY", "2025-01-31"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-31",
      "2025-04-30",
      "2025-07-31",
      "2025-10-31",
    ]);
    expect(generateOccurrences(s("QUARTERLY", "2024-11-30"), "2024-11-01", "2025-08-31")).toEqual([
      "2024-11-30",
      "2025-02-28",
      "2025-05-30",
      "2025-08-30",
    ]);
  });

  it("windows starting mid-month and narrow windows", () => {
    expect(generateOccurrences(s("MONTHLY", "2025-01-31"), "2025-03-15", "2025-05-15")).toEqual([
      "2025-03-31",
      "2025-04-30",
    ]);
    expect(generateOccurrences(s("MONTHLY", "2025-01-31"), "2025-02-28", "2025-02-28")).toEqual(["2025-02-28"]);
    expect(generateOccurrences(s("MONTHLY", "2025-01-31"), "2025-03-01", "2025-03-30")).toEqual([]);
    expect(generateOccurrences(s("QUARTERLY", "2025-01-15"), "2025-02-01", "2025-03-31")).toEqual([]);
  });
});

describe("ONE_TIME, anchor, endDate", () => {
  it("one-time occurs once at the anchor and ignores endDate", () => {
    expect(generateOccurrences(s("ONE_TIME", "2025-01-10"), "2025-01-01", "2026-12-31")).toEqual(["2025-01-10"]);
    expect(generateOccurrences(s("ONE_TIME", "2025-01-10", "2025-01-09"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-10",
    ]);
    expect(generateOccurrences(s("ONE_TIME", "2025-01-10", "2030-01-01"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-10",
    ]);
    expect(generateOccurrences(s("ONE_TIME", "2024-12-31"), "2025-01-01", "2025-12-31")).toEqual([]);
    expect(generateOccurrences(s("ONE_TIME", "2026-01-01"), "2025-01-01", "2025-12-31")).toEqual([]);
  });

  it("nothing before the anchor", () => {
    expect(generateOccurrences(s("WEEKLY", "2025-01-15"), "2025-01-01", "2025-01-31")).toEqual([
      "2025-01-15",
      "2025-01-22",
      "2025-01-29",
    ]);
    expect(generateOccurrences(s("MONTHLY", "2025-06-10"), "2025-01-01", "2025-06-09")).toEqual([]);
  });

  it("endDate is inclusive", () => {
    expect(generateOccurrences(s("WEEKLY", "2025-01-03", "2025-01-17"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-03",
      "2025-01-10",
      "2025-01-17",
    ]);
    expect(generateOccurrences(s("WEEKLY", "2025-01-03", "2025-01-16"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-03",
      "2025-01-10",
    ]);
    expect(generateOccurrences(s("MONTHLY", "2025-01-31", "2025-02-28"), "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-31",
      "2025-02-28",
    ]);
  });

  it("isScheduledOn", () => {
    const m = s("MONTHLY", "2025-01-31", "2025-06-30");
    expect(isScheduledOn(m, "2025-02-28")).toBe(true);
    expect(isScheduledOn(m, "2025-02-27")).toBe(false);
    expect(isScheduledOn(m, "2025-01-30")).toBe(false);
    expect(isScheduledOn(m, "2025-06-30")).toBe(true);
    expect(isScheduledOn(m, "2025-07-31")).toBe(false); // after endDate
    expect(isScheduledOn(m, "2024-12-31")).toBe(false); // before anchor
    expect(isScheduledOn(s("ONE_TIME", "2025-01-10"), "2025-01-10")).toBe(true);
    expect(isScheduledOn(s("ONE_TIME", "2025-01-10"), "2025-01-17")).toBe(false);
  });
});

describe("property: matches an independent oracle; window slices compose", () => {
  const FREQS: Schedule["frequency"][] = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

  it("200 random schedules", () => {
    const r = rng(42);
    for (let n = 0; n < 200; n++) {
      const anchor = oracleAddDays("2023-01-01", r.int(0, 2000));
      const endDate = r.bool(0.3) ? oracleAddDays(anchor, r.int(0, 700)) : null;
      const sch = s(r.pick(FREQS), anchor, endDate);
      const from = oracleAddDays("2024-01-01", r.int(0, 600));
      const to = oracleAddDays(from, r.int(0, 400));

      const expected: string[] = [];
      for (let d = from; d <= to; d = oracleAddDays(d, 1)) if (oracleIsScheduled(sch, d)) expected.push(d);
      const got = generateOccurrences(sch, from, to);
      expect(got, JSON.stringify({ sch, from, to })).toEqual(expected);

      // Splitting the window anywhere gives the same dates, never duplicated.
      const mid = oracleAddDays(from, r.int(0, Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 864e5))));
      const left = generateOccurrences(sch, from, mid);
      const right = mid < to ? generateOccurrences(sch, oracleAddDays(mid, 1), to) : [];
      expect([...left, ...right]).toEqual(got);
    }
  });
});
