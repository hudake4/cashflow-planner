/**
 * Savings goals: does the forecast support reaching a target amount by a target date?
 *
 * Pure: the projection and `today` are passed in by the caller. Money is integer cents.
 */
import type { ProjectionResponse } from "../contracts/api";
import { diffDays } from "./dates";

/** A goal as the UI/API store it. `name` is optional. */
export interface SavingsGoal {
  name?: string | null;
  /** Target amount in integer cents. */
  targetAmountCents?: number;
  /** Target date as YYYY-MM-DD. */
  targetDate?: string;
  // Convenience aliases accepted so callers/tests can use either spelling.
  targetCents?: number;
  targetAmount?: number;
  amountCents?: number;
  amount?: number;
  date?: string;
  target?: string;
  dueDate?: string;
}

export interface SavingsGoalEvaluation {
  /** True when the projected balance on the target date is at least the target. */
  supported: boolean;
  /** Projected end-of-day balance on the target date (integer cents). */
  projectedBalanceCents: number;
  /** How far short of the target the projection falls (0 when supported). */
  shortfallCents: number;
  /** Extra amount to save each week to reach the target by the date (0 when supported). */
  weeklyAmountNeededCents: number;
  /** Whole-ish weeks from `today` to the target date. */
  weeksRemaining: number;
}

function targetAmountCents(goal: SavingsGoal): number {
  return (
    goal.targetAmountCents ??
    goal.targetCents ??
    goal.targetAmount ??
    goal.amountCents ??
    goal.amount ??
    0
  );
}

function targetDate(goal: SavingsGoal): string {
  return goal.targetDate ?? goal.date ?? goal.target ?? goal.dueDate ?? "";
}

function projectedBalanceAt(projection: ProjectionResponse, date: string): number {
  const day = projection.days.find((d) => d.date === date);
  if (day) return day.closingBalanceCents;
  if (projection.days.length === 0) return projection.startingBalanceCents;
  if (date < projection.range.from) return projection.startingBalanceCents;
  // Past the end of the available range: use the last projected balance.
  return projection.days[projection.days.length - 1].closingBalanceCents;
}

export function evaluateSavingsGoal(
  projection: ProjectionResponse,
  goal: SavingsGoal,
  today: string,
): SavingsGoalEvaluation {
  const target = targetAmountCents(goal);
  const date = targetDate(goal);
  const projectedBalanceCents = projectedBalanceAt(projection, date);
  const shortfallCents = Math.max(0, target - projectedBalanceCents);
  const supported = shortfallCents === 0;

  const daysRemaining = date ? diffDays(today, date) : 0;
  const weeksRemaining = daysRemaining > 0 ? Math.ceil(daysRemaining / 7) : 0;

  let weeklyAmountNeededCents = 0;
  if (shortfallCents > 0) {
    if (weeksRemaining > 0) {
      weeklyAmountNeededCents = Math.ceil(shortfallCents / weeksRemaining);
    } else {
      weeklyAmountNeededCents = shortfallCents;
    }
  }

  return {
    supported,
    projectedBalanceCents,
    shortfallCents,
    weeklyAmountNeededCents,
    weeksRemaining,
  };
}

export type SavingsGoalInput = SavingsGoal;
export type Goal = SavingsGoal;
export type SavingsGoalResult = SavingsGoalEvaluation;
export default evaluateSavingsGoal;