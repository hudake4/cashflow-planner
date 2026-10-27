import type { LowPointInsight, ProjectionResponse } from "../contracts/api";
import { maxDate } from "./dates";
import { computeProjection, type ProjectionInput } from "./projection";

/** Finds upcoming bills before the projected low that improve the window low when moved to payday. */
export const LOW_POINT_BILL_LIMIT = 5;

export function buildLowPointInsight(
  projection: ProjectionResponse,
  input: ProjectionInput,
  referenceDate: string,
): LowPointInsight | null {
  const { lowestBalanceDate: date, lowestBalanceCents: balanceCents } = projection.totals;
  if (date < referenceDate) return null;
  const payday = projection.events.find((event) => event.kind === "INCOME" && event.date > date);
  if (!payday) return null;
  const lastIncome = projection.events.filter((event) => event.kind === "INCOME" && event.date <= date).at(-1);
  const start = lastIncome?.date ?? projection.window.startDate;
  const periodStart = maxDate(start, referenceDate);
  const candidates = projection.events.filter((event) =>
    event.kind === "BILL" &&
    event.included &&
    event.status === "UPCOMING" &&
    event.date >= periodStart &&
    event.date <= date
  );
  const moved = candidates.flatMap((event) => {
    const bill = input.bills.find((item) => item.id === event.sourceId);
    if (!bill) return [];
    const occurrences = input.occurrences.filter((row) => row.billId !== bill.id || row.dueDate !== event.date);
    occurrences.push({ billId: bill.id, dueDate: event.date, status: "SKIPPED", amountOverrideCents: null });
    const result = computeProjection({
      ...input,
      occurrences,
      bills: [
        ...input.bills,
        {
          ...bill,
          id: `lowpoint:${event.id}`,
          name: event.name,
          amountCents: event.amountCents,
          frequency: "ONE_TIME",
          anchorDate: payday.date,
          endDate: null,
          active: true,
        },
      ],
      from: undefined,
      to: undefined,
    });
    return result.totals.lowestBalanceCents > balanceCents ? [{ event, lowest: result.totals.lowestBalanceCents, lowestDate: result.totals.lowestBalanceDate }] : [];
  });
  moved.sort((a, b) => b.lowest - a.lowest || a.event.sequence - b.event.sequence);
  const bills = moved.slice(0, LOW_POINT_BILL_LIMIT).map(({ event, lowest, lowestDate }) => ({
    eventId: event.id,
    billId: event.sourceId,
    name: event.name,
    date: event.date,
    amountCents: event.amountCents,
    lowestIfMovedCents: lowest, lowestIfMovedDate: lowestDate,
  }));
  return bills.length ? { date, balanceCents, payday: { date: payday.date, name: payday.name, amountCents: payday.amountCents }, bills } : null;
}
