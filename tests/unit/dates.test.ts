import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  daysInMonth,
  diffDays,
  eachDay,
  maxDate,
  minDate,
  startOfWeek,
  todayLocal,
} from "@/domain/dates";

describe("addDays", () => {
  it("crosses month/year/leap boundaries", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
    expect(addDays("2025-01-01", 365)).toBe("2026-01-01");
    expect(addDays("2028-01-01", 365)).toBe("2028-12-31"); // leap year
    expect(addDays("2025-06-15", 0)).toBe("2025-06-15");
  });

  it("is unaffected by DST transitions (US: 2025-03-09, 2025-11-02)", () => {
    expect(addDays("2025-03-08", 1)).toBe("2025-03-09");
    expect(addDays("2025-03-09", 1)).toBe("2025-03-10");
    expect(addDays("2025-11-01", 1)).toBe("2025-11-02");
    expect(addDays("2025-11-02", 1)).toBe("2025-11-03");
    expect(eachDay("2025-03-01", "2025-03-31")).toHaveLength(31);
    expect(eachDay("2025-10-26", "2025-11-08")).toHaveLength(14);
  });
});

describe("daysInMonth", () => {
  it("handles every month and leap years", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2025, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28); // century, not leap
    expect(daysInMonth(2000, 2)).toBe(29); // 400-year rule
  });
});

describe("addMonthsClamped (month-end policy, no drift)", () => {
  it("anchor Jan 31", () => {
    const a = "2025-01-31";
    expect([0, 1, 2, 3, 4, 5].map((k) => addMonthsClamped(a, k))).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
      "2025-05-31",
      "2025-06-30",
    ]);
    expect(addMonthsClamped(a, 12)).toBe("2026-01-31");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("anchor the 30th and 29th", () => {
    expect(addMonthsClamped("2025-01-30", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-01-30", 2)).toBe("2025-03-30");
    expect(addMonthsClamped("2025-01-29", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-01-29", 2)).toBe("2025-03-29");
    expect(addMonthsClamped("2024-01-29", 1)).toBe("2024-02-29");
  });

  it("crosses year boundaries and handles yearly Feb 29", () => {
    expect(addMonthsClamped("2025-11-15", 3)).toBe("2026-02-15");
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonthsClamped("2024-02-29", 48)).toBe("2028-02-29");
  });
});

describe("diffDays / eachDay / startOfWeek / min / max", () => {
  it("diffDays is to - from", () => {
    expect(diffDays("2025-01-01", "2025-01-01")).toBe(0);
    expect(diffDays("2025-01-01", "2025-03-01")).toBe(59);
    expect(diffDays("2024-01-01", "2024-03-01")).toBe(60);
    expect(diffDays("2025-03-01", "2025-01-01")).toBe(-59);
  });

  it("eachDay is inclusive and empty when reversed", () => {
    expect(eachDay("2025-02-27", "2025-03-02")).toEqual(["2025-02-27", "2025-02-28", "2025-03-01", "2025-03-02"]);
    expect(eachDay("2025-01-05", "2025-01-05")).toEqual(["2025-01-05"]);
    expect(eachDay("2025-01-06", "2025-01-05")).toEqual([]);
  });

  it("startOfWeek honors weekStartsOn", () => {
    // 2025-01-01 is a Wednesday
    expect(startOfWeek("2025-01-01", 0)).toBe("2024-12-29"); // Sunday
    expect(startOfWeek("2025-01-01", 1)).toBe("2024-12-30"); // Monday
    expect(startOfWeek("2025-01-05", 0)).toBe("2025-01-05"); // a Sunday
    expect(startOfWeek("2025-01-05", 1)).toBe("2024-12-30"); // Sunday belongs to the Monday week
    expect(startOfWeek("2025-01-06", 1)).toBe("2025-01-06");
    expect(startOfWeek("2025-01-04", 6)).toBe("2025-01-04"); // Saturday start
  });

  it("todayLocal uses local calendar parts", () => {
    expect(todayLocal(new Date(2025, 6, 4, 23, 59))).toBe("2025-07-04");
    expect(todayLocal(new Date(2025, 0, 1, 0, 0))).toBe("2025-01-01");
  });

  it("minDate / maxDate", () => {
    expect(minDate("2025-01-02", "2025-01-10")).toBe("2025-01-02");
    expect(maxDate("2025-01-02", "2025-01-10")).toBe("2025-01-10");
  });
});
