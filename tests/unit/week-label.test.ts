import { describe, expect, it } from "vitest";
import { weekCoverage, weekLabel, weekSpokenLabel, weekStartText } from "@/components/calendar/week-label";
import { startOfWeek } from "@/lib/dates";

// 2026-10-24 is a Saturday: a projection starting then is a partial first week.
const START = "2026-10-24";

describe("week label", () => {
  it("names a week by its calendar week start for a Sunday week start", () => {
    expect(weekStartText(startOfWeek(START, 0))).toBe("Oct 18");
    expect(weekLabel(startOfWeek(START, 0))).toBe("Week of Oct 18");
  });

  it("names a week by its calendar week start for a Monday week start", () => {
    expect(weekLabel(startOfWeek(START, 1))).toBe("Week of Oct 19");
  });

  it("describes the dates a partial week covers separately from its name", () => {
    expect(weekCoverage({ rangeStart: START, rangeEnd: "2026-10-25" })).toBe("Oct 24 – Oct 25, 2026");
    expect(weekCoverage({ rangeStart: START, rangeEnd: START })).toBe("Oct 24, 2026");
  });

  it("keeps the same name in the spoken label and adds the covered range only for a partial week", () => {
    const partial = { weekStart: "2026-10-19", partial: true, rangeStart: START, rangeEnd: "2026-10-25" };
    expect(weekSpokenLabel(partial)).toBe("Week of Oct 19 (partial, covers Oct 24 – Oct 25, 2026)");
    expect(weekSpokenLabel({ ...partial, weekStart: "2026-10-26", partial: false, rangeStart: "2026-10-26", rangeEnd: "2026-11-01" })).toBe("Week of Oct 26");
  });
});