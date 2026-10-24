/**
 * Reconciliation invariants (CONVENTIONS section 7) and an independent brute-force
 * oracle. The oracle deliberately does NOT use src/domain/dates or recurrence so it
 * can catch bugs there.
 */
import { expect } from "vitest";
import type { LedgerEvent, ProjectionResponse } from "@/contracts/api";
import type { ProjectionInput } from "@/domain/projection";

const DAY = 86_400_000;
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const ms = (d: string) => {
  const [y, m, dd] = parts(d);
  return Date.UTC(y, m - 1, dd);
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const oracleAddDays = (d: string, n: number) => iso(ms(d) + n * DAY);
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function oracleIsScheduled(
  s: { frequency: string; anchorDate: string; endDate: string | null },
  d: string,
): boolean {
  if (d < s.anchorDate) return false;
  if (s.frequency === "ONE_TIME") return d === s.anchorDate;
  if (s.endDate && d > s.endDate) return false;
  const diff = Math.round((ms(d) - ms(s.anchorDate)) / DAY);
  if (s.frequency === "WEEKLY") return diff % 7 === 0;
  if (s.frequency === "BIWEEKLY") return diff % 14 === 0;
  const step = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[s.frequency];
  if (!step) throw new Error(`unknown frequency ${s.frequency}`);
  const [ay, am, ad] = parts(s.anchorDate);
  const [y, m, dd] = parts(d);
  const months = (y - ay) * 12 + (m - am);
  return months % step === 0 && dd === Math.min(ad, dim(y, m));
}

/** End-of-day balances from projectionStartDate through `to`, computed by brute force. */
export function oracleClosings(inp: ProjectionInput, to: string): Map<string, number> {
  const out = new Map<string, number>();
  const occ = new Map(inp.occurrences.map((o) => [`${o.billId}:${o.dueDate}`, o]));
  let bal = inp.settings.startingBalanceCents;
  for (let d = inp.settings.projectionStartDate; d <= to; d = oracleAddDays(d, 1)) {
    for (const i of inp.incomes) if (i.active && oracleIsScheduled(i, d)) bal += i.amountCents;
    for (const b of inp.bills) {
      if (!b.active || !oracleIsScheduled(b, d)) continue;
      const o = occ.get(`${b.id}:${d}`);
      if (o?.status === "SKIPPED") continue;
      bal -= o?.amountOverrideCents ?? b.amountCents;
    }
    out.set(d, bal);
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Asserts every section 7 invariant on a ProjectionResponse. */
export function assertReconciled(p: ProjectionResponse) {
  const byId = new Map<string, LedgerEvent>();
  for (const e of p.events) {
    expect(byId.has(e.id), `duplicate event id ${e.id}`).toBe(false);
    byId.set(e.id, e);
    expect(e.id).toBe(`${e.kind}:${e.sourceId}:${e.date}`);
    expect(Number.isInteger(e.amountCents) && e.amountCents > 0).toBe(true);
    expect(e.signedAmountCents).toBe(!e.included ? 0 : e.kind === "INCOME" ? e.amountCents : -e.amountCents);
    expect(e.date >= p.range.from && e.date <= p.range.to).toBe(true);
  }

  // Ledger order (section 6) and running balance / sequence continuity.
  for (let i = 1; i < p.events.length; i++) {
    const a = p.events[i - 1];
    const b = p.events[i];
    expect(b.sequence).toBe(a.sequence + 1);
    expect(b.balanceAfterCents).toBe(a.balanceAfterCents + b.signedAmountCents);
    const ka = a.kind === "INCOME" ? 0 : 1;
    const kb = b.kind === "INCOME" ? 0 : 1;
    const order =
      a.date !== b.date
        ? a.date < b.date
        : ka !== kb
          ? ka < kb
          : a.name.toLowerCase() !== b.name.toLowerCase()
            ? a.name.toLowerCase() < b.name.toLowerCase()
            : a.name !== b.name
              ? a.name < b.name
              : a.sourceId < b.sourceId;
    expect(order, `events out of order: ${a.id} then ${b.id}`).toBe(true);
  }

  // Days: one per date in range, contiguous, reconciled.
  expect(p.days.length).toBe(Math.round((ms(p.range.to) - ms(p.range.from)) / DAY) + 1);
  expect(p.days[0].date).toBe(p.range.from);
  const dayIds: string[] = [];
  for (let i = 0; i < p.days.length; i++) {
    const d = p.days[i];
    if (i > 0) {
      expect(d.date).toBe(oracleAddDays(p.days[i - 1].date, 1));
      expect(d.openingBalanceCents).toBe(p.days[i - 1].closingBalanceCents);
    }
    const evs = d.eventIds.map((id) => byId.get(id)!);
    evs.forEach((e) => expect(e.date).toBe(d.date));
    expect(d.incomeCents).toBe(sum(evs.filter((e) => e.included && e.kind === "INCOME").map((e) => e.amountCents)));
    expect(d.billsCents).toBe(sum(evs.filter((e) => e.included && e.kind === "BILL").map((e) => e.amountCents)));
    expect(d.netCents).toBe(d.incomeCents - d.billsCents);
    expect(d.closingBalanceCents).toBe(d.openingBalanceCents + d.netCents);
    expect(d.openingBalanceCents + sum(evs.map((e) => e.signedAmountCents))).toBe(d.closingBalanceCents);
    if (evs.length) expect(evs[evs.length - 1].balanceAfterCents).toBe(d.closingBalanceCents);
    dayIds.push(...d.eventIds);
  }
  expect(dayIds, "day eventIds must partition events in ledger order").toEqual(p.events.map((e) => e.id));
  if (p.range.from === p.window.startDate) expect(p.days[0].openingBalanceCents).toBe(p.startingBalanceCents);

  // Weeks.
  const weekIds: string[] = [];
  const dayByDate = new Map(p.days.map((d) => [d.date, d]));
  for (let i = 0; i < p.weeks.length; i++) {
    const w = p.weeks[i];
    expect(w.weekEnd).toBe(oracleAddDays(w.weekStart, 6));
    expect(new Date(ms(w.weekStart)).getUTCDay()).toBe(p.weekStartsOn);
    expect(w.rangeStart >= w.weekStart && w.rangeEnd <= w.weekEnd && w.rangeStart <= w.rangeEnd).toBe(true);
    expect(w.partial).toBe(w.rangeStart > w.weekStart || w.rangeEnd < w.weekEnd);
    expect(w.closingBalanceCents).toBe(w.openingBalanceCents + w.incomeCents - w.billsCents);
    expect(w.netCents).toBe(w.incomeCents - w.billsCents);
    if (i > 0) {
      expect(w.openingBalanceCents).toBe(p.weeks[i - 1].closingBalanceCents);
      expect(w.rangeStart).toBe(oracleAddDays(p.weeks[i - 1].rangeEnd, 1));
    }
    const evs = w.eventIds.map((id) => byId.get(id)!);
    evs.forEach((e) => expect(e.date >= w.rangeStart && e.date <= w.rangeEnd).toBe(true));
    expect(w.openingBalanceCents + sum(evs.map((e) => e.signedAmountCents))).toBe(w.closingBalanceCents);
    expect(w.openingBalanceCents).toBe(dayByDate.get(w.rangeStart)!.openingBalanceCents);
    expect(w.closingBalanceCents).toBe(dayByDate.get(w.rangeEnd)!.closingBalanceCents);
    const wDays = p.days.filter((d) => d.date >= w.rangeStart && d.date <= w.rangeEnd);
    const low = Math.min(w.openingBalanceCents, ...wDays.map((d) => d.closingBalanceCents));
    expect(w.lowestBalanceCents).toBe(low);
    expect(w.hasNegative).toBe(low < 0);
    weekIds.push(...w.eventIds);
  }
  expect(p.weeks[0].rangeStart).toBe(p.range.from);
  expect(p.weeks[p.weeks.length - 1].rangeEnd).toBe(p.range.to);
  expect(weekIds, "week eventIds must partition events").toEqual(p.events.map((e) => e.id));

  // Totals.
  const t = p.totals;
  expect(t.openingBalanceCents).toBe(p.days[0].openingBalanceCents);
  expect(t.endingBalanceCents).toBe(p.days[p.days.length - 1].closingBalanceCents);
  expect(t.incomeCents).toBe(sum(p.days.map((d) => d.incomeCents)));
  expect(t.billsCents).toBe(sum(p.days.map((d) => d.billsCents)));
  expect(t.netCents).toBe(t.incomeCents - t.billsCents);
  expect(t.openingBalanceCents + t.netCents).toBe(t.endingBalanceCents);
  expect(t.openingBalanceCents + sum(p.events.map((e) => e.signedAmountCents))).toBe(t.endingBalanceCents);
  const lows = [t.openingBalanceCents, ...p.days.map((d) => d.closingBalanceCents)];
  expect(t.lowestBalanceCents).toBe(Math.min(...lows));
  expect(t.negativeDayCount).toBe(p.days.filter((d) => d.closingBalanceCents < 0).length);
}
