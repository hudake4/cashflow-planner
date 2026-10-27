import type { DashboardResponse, DaySummary, LedgerEvent } from "../contracts/api";

type LowPointBills = DashboardResponse["lowPointBills"];

/** Finds included bills in the pay cycle before the dashboard's full-window low. */
export function findLowPointBills(input: {
  days: DaySummary[];
  events: LedgerEvent[];
  referenceDate: string;
}): LowPointBills {
  const { days, events, referenceDate } = input;
  if (days.length === 0) return null;

  const low = lowestEndOfDay(days);
  const incomes = events.filter((event) => event.kind === "INCOME" && event.included);
  const nextPayday = incomes.find((event) => event.date > low.date);
  if (!nextPayday) return null;

  const cycleStart = incomes.filter((event) => event.date <= low.date).at(-1)?.date ?? days[0].date;
  const candidates = events.filter((event) =>
    event.kind === "BILL" && event.included && event.date >= cycleStart && event.date <= low.date && event.date >= referenceDate,
  );

  const bills = candidates.flatMap((bill) => {
    const moved = lowestEndOfDay(days.map((day) => day.date >= bill.date && day.date < nextPayday.date
      ? { ...day, closingBalanceCents: day.closingBalanceCents + bill.amountCents }
      : day));
    return moved.cents > low.cents ? [{
      eventId: bill.id,
      billId: bill.sourceId,
      name: bill.name,
      date: bill.date,
      amountCents: bill.amountCents,
      movedLowestBalanceCents: moved.cents,
      movedLowestBalanceDate: moved.date,
    }] : [];
  }).sort((a, b) => b.movedLowestBalanceCents - a.movedLowestBalanceCents ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, 5);

  return bills.length ? {
    lowestBalanceCents: low.cents,
    lowestBalanceDate: low.date,
    nextPayday: nextPayday.date,
    bills,
  } : null;
}

/** Section 7: opening balance counts and an equal later low keeps the earlier date. */
function lowestEndOfDay(days: DaySummary[]): { cents: number; date: string } {
  let lowest = { cents: days[0].openingBalanceCents, date: days[0].date };
  for (const day of days) {
    if (day.closingBalanceCents < lowest.cents) lowest = { cents: day.closingBalanceCents, date: day.date };
  }
  return lowest;
}
