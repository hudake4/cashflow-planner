import { fmtDate, fmtRange } from "@/lib/dates";

/** The date a calendar week starts on, as shown in labels ("Oct 18"). */
export function weekStartText(weekStart: string): string {
  return fmtDate(weekStart, "MMM d");
}

/**
 * The one name for a calendar week ("Week of Oct 18"). It is always the calendar week start,
 * even for a partial first week, so the register header, its accessible label, the register
 * section and the drawer title all agree. The dates a partial week actually covers go in
 * {@link weekCoverage} instead.
 */
export function weekLabel(weekStart: string): string {
  return `Week of ${weekStartText(weekStart)}`;
}

/** The dates a week covers inside the projection ("Oct 24 – Oct 25, 2026"). */
export function weekCoverage(week: { rangeStart: string; rangeEnd: string }): string {
  return fmtRange(week.rangeStart, week.rangeEnd);
}

/** The week name for screen readers: the same label, plus what a partial week covers. */
export function weekSpokenLabel(week: { weekStart: string; partial: boolean; rangeStart: string; rangeEnd: string }): string {
  const label = weekLabel(week.weekStart);
  return week.partial ? `${label} (partial, covers ${weekCoverage(week)})` : label;
}
