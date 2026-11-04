/**
 * Recap over the stored bank snapshot and the tracked bills. Reads the local database only: it never
 * calls SimpleFIN (that would spend the 24 requests/day allowance on a page view).
 */
import type { ReviewResponse } from "../../contracts/api";
import { monthRanges } from "../../domain/spending";
import { buildReview } from "../../domain/review";
import { addDays, startOfWeek } from "../../domain/dates";
import { db, HOUSEHOLD_ID } from "../db";
import { loadSpendingInput } from "./spending";

export async function getReview(now: Date = new Date()): Promise<ReviewResponse> {
  const { input, settings, summary } = await loadSpendingInput(now);

  // The earliest day any comparison needs: the start of last month or of last week, whichever is older.
  const since = [monthRanges(input.today).lastFrom, addDays(startOfWeek(input.today, settings.weekStartsOn), -7)].sort()[0];
  const paid = await db.billOccurrence.findMany({
    where: { status: "PAID", dueDate: { gte: since, lte: input.today }, bill: { householdId: HOUSEHOLD_ID } },
    select: { dueDate: true, amountOverrideCents: true, bill: { select: { amountCents: true } } },
  });

  return {
    ...buildReview({
      ...input,
      weekStartsOn: settings.weekStartsOn,
      paidBills: paid.map((o) => ({ dueDate: o.dueDate, amountCents: o.amountOverrideCents ?? o.bill.amountCents })),
    }),
    ...summary,
  };
}
