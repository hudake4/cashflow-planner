/**
 * Dashboard summary built on top of the projection engine (CONVENTIONS section 8).
 * Pure: `today` is passed in by the caller.
 */
import type { DashboardResponse, SettingsDTO } from "../contracts/api";
import { addDays, clampDate, maxDate } from "./dates";
import { computeProjection, type ProjectionInput } from "./projection";

/** How many days ahead of the reference date "upcoming bills" covers (inclusive span of 14 days). */
export const UPCOMING_BILL_DAYS = 14;
export const UPCOMING_BILL_LIMIT = 8;

export type DashboardInput = Omit<ProjectionInput, "from" | "to" | "settings"> & { settings: SettingsDTO; today: string };

export function buildDashboard(input: DashboardInput): DashboardResponse {
  const { settings, today } = input;
  // Full forecast window (no from/to → [start, start + forecastDays - 1]).
  const projection = computeProjection({ ...input, from: undefined, to: undefined });
  const { startDate, endDate } = projection.window;

  // referenceDate = max(today, start), clamped to the window end (section 8).
  const referenceDate = clampDate(maxDate(today, startDate), startDate, endDate);
  const upcomingEnd = addDays(referenceDate, UPCOMING_BILL_DAYS - 1);

  const currentIndex = projection.weeks.findIndex((w) => w.weekStart <= referenceDate && referenceDate <= w.weekEnd);
  const paycheck = projection.events.find((e) => e.kind === "INCOME" && e.date >= referenceDate);

  return {
    today,
    settings,
    window: { startDate, endDate },
    hasData: input.incomes.some((i) => i.active) || input.bills.some((b) => b.active),
    nextPaycheck: paycheck
      ? { date: paycheck.date, name: paycheck.name, amountCents: paycheck.amountCents, sourceId: paycheck.sourceId }
      : null,
    upcomingBills: projection.events
      .filter((e) => e.kind === "BILL" && e.included && e.date >= referenceDate && e.date <= upcomingEnd)
      .slice(0, UPCOMING_BILL_LIMIT),
    currentWeek: currentIndex >= 0 ? projection.weeks[currentIndex] : null,
    nextWeek: currentIndex >= 0 ? (projection.weeks[currentIndex + 1] ?? null) : null,
    totals: projection.totals,
    trend: projection.days.map((d) => ({ date: d.date, balanceCents: d.closingBalanceCents })),
  };
}
