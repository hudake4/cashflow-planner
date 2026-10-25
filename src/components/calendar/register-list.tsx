"use client";

import { clsx } from "clsx";
import { ChevronRight, CircleCheck, TriangleAlert } from "lucide-react";
import type { LedgerEvent, WeekSummary } from "@/contracts/api";
import { fmtDate, fmtRange } from "@/lib/dates";
import { money, signedMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Balance, EventAmount } from "@/components/ui/money";
import { eventAriaLabel } from "./event-labels";
import type { GridWeek } from "./heatmap-calendar";

/** A balance for screen readers: the sign alone is easy to miss, so a negative one says so (like `Balance`). */
function spokenBalance(cents: number, currency: string): string {
  return `${cents < 0 ? "negative balance " : ""}${money(cents, currency)}`;
}

/** The week header's accessible name carries everything the visible header shows, including the dip warning. */
function weekHeaderLabel(week: WeekSummary, currency: string): string {
  const dip = week.hasNegative ? `, dips below zero, low ${spokenBalance(week.lowestBalanceCents, currency)}` : "";
  return `Week of ${fmtRange(week.rangeStart, week.rangeEnd)}: opening ${spokenBalance(week.openingBalanceCents, currency)}, income ${money(week.incomeCents, currency)}, bills ${money(week.billsCents, currency)}, closing ${spokenBalance(week.closingBalanceCents, currency)}${dip}. Open week details.`;
}

function WeekHeader({ week, currency, onSelect }: { week: WeekSummary; currency: string; onSelect: (week: WeekSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(week)}
      data-testid={`week-summary-${week.weekStart}`}
      aria-label={weekHeaderLabel(week, currency)}
      className={clsx(
        "group flex min-h-11 w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors hover:bg-slate-100",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600",
        week.hasNegative ? "bg-rose-50" : "bg-slate-50",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semiwide text-sm font-bold text-slate-800">
          Week of {fmtDate(week.weekStart, "MMM d")}
          {week.partial && <span className="ml-1 font-normal text-slate-500">(partial)</span>}
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-700 group-hover:underline" aria-hidden="true">
          Details <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-baseline gap-1" data-testid={`week-opening-${week.weekStart}`}>
          <span className="text-slate-500">Opening</span>
          <Balance cents={week.openingBalanceCents} currency={currency} iconClassName="h-3 w-3" className="text-slate-800" />
        </span>
        <span title="Income this week" data-testid={`week-income-${week.weekStart}`}>
          <EventAmount kind="INCOME" amountCents={week.incomeCents} currency={currency} />
        </span>
        <span title="Bills this week" data-testid={`week-bills-${week.weekStart}`}>
          <EventAmount kind="BILL" amountCents={week.billsCents} currency={currency} />
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-slate-500">Net</span>
          <span
            data-testid={`week-net-${week.weekStart}`}
            className={clsx("font-medium tabular-nums", week.netCents < 0 ? "text-rose-700" : week.netCents > 0 ? "text-emerald-700" : "text-slate-700")}
          >
            {signedMoney(week.netCents, currency)}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5 rounded-chip border-b-[3px] border-double border-slate-400 bg-sheet px-2 py-0.5">
          <span className="font-semibold text-slate-700">Closing</span>
          <Balance cents={week.closingBalanceCents} currency={currency} className="text-sm font-semibold text-slate-900" testId={`week-closing-${week.weekStart}`} />
        </span>
        {week.hasNegative && (
          <span className="flex items-center gap-1 font-medium text-rose-700" data-testid={`week-negative-${week.weekStart}`}>
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Dips below zero (low {money(week.lowestBalanceCents, currency)})
          </span>
        )}
      </span>
    </button>
  );
}

function RegisterRow({ event, currency, onSelect }: { event: LedgerEvent; currency: string; onSelect: (event: LedgerEvent) => void }) {
  const skipped = event.status === "SKIPPED";
  const negative = event.balanceAfterCents < 0;
  return (
    <li className="border-t border-slate-200 first:border-t-0">
      <button
        type="button"
        data-testid={`event-${event.id}`}
        data-kind={event.kind}
        data-status={event.status}
        aria-label={eventAriaLabel(event, currency)}
        onClick={() => onSelect(event)}
        className={clsx(
          "grid min-h-11 w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50",
          "@lg:grid-cols-[3.75rem_minmax(0,1fr)_7rem_7.5rem] @lg:items-center",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600",
          negative && "bg-rose-50/50",
        )}
      >
        <span className="row-span-2 pt-0.5 text-xs font-medium whitespace-nowrap text-slate-600 tabular-nums @lg:row-span-1 @lg:pt-0">{fmtDate(event.date, "EEE d")}</span>
        <span className="row-span-2 min-w-0 @lg:row-span-1">
          <span className={clsx("block font-medium break-words text-slate-900", skipped && "text-slate-500 line-through")}>{event.name}</span>
          {(event.status === "PAID" || skipped || event.amountOverridden) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              {event.status === "PAID" && (
                <Badge tone="positive" className="gap-0.5">
                  <CircleCheck className="size-3" aria-hidden="true" /> Paid
                </Badge>
              )}
              {skipped && <Badge tone="neutral">Skipped, not counted</Badge>}
              {event.amountOverridden && <Badge tone="info">Adjusted</Badge>}
            </span>
          )}
        </span>
        <span className="justify-self-end @lg:col-start-3 @lg:row-start-1">
          <EventAmount kind={event.kind} amountCents={event.amountCents} currency={currency} muted={skipped} className={clsx("text-sm", skipped && "line-through")} />
        </span>
        <span className="justify-self-end text-xs text-slate-600 @lg:col-start-4 @lg:row-start-1 @lg:text-sm">
          <span className="sr-only">Balance after: </span>
          <span aria-hidden="true" className="mr-1 text-slate-500 @lg:hidden">
            Bal
          </span>
          <Balance cents={event.balanceAfterCents} currency={currency} iconClassName="h-3 w-3" testId={`event-balance-${event.id}`} className={clsx(negative && "rounded-chip bg-rose-100 px-1")} />
        </span>
      </button>
    </li>
  );
}

function Note({ children }: { children: string }) {
  return <p className="rounded-sheet border border-dashed border-slate-300 bg-slate-100/60 px-3 py-2 text-xs text-slate-500">{children}</p>;
}

function plural(n: number): string {
  return n === 1 ? "week is" : "weeks are";
}

/**
 * Running-balance register for the visible range, grouped by week. Every week
 * gets a header (even with no events); weeks outside the projection collapse
 * into one muted line.
 */
export function RegisterList({
  weeks,
  weeksByStart,
  eventsById,
  currency,
  onSelectWeek,
  onSelectEvent,
}: {
  weeks: GridWeek[];
  weeksByStart: Map<string, WeekSummary>;
  eventsById: Map<string, LedgerEvent>;
  currency: string;
  onSelectWeek: (week: WeekSummary) => void;
  onSelectEvent: (event: LedgerEvent) => void;
}) {
  const earlier = weeks.filter((w) => !weeksByStart.has(w.weekStart) && w.days.every((d) => d.state === "before-start")).length;
  const later = weeks.filter((w) => !weeksByStart.has(w.weekStart) && w.days.every((d) => d.state === "beyond-range")).length;
  const shown = weeks.flatMap((w) => {
    const week = weeksByStart.get(w.weekStart);
    return week ? [{ key: w.weekStart, week }] : [];
  });

  return (
    <section aria-label="Running balance register" className="@container min-w-0 space-y-3" data-testid="calendar-register">
      <div
        className="hidden grid-cols-[3.75rem_minmax(0,1fr)_7rem_7.5rem] gap-x-3 px-3 text-xs font-semibold text-slate-600 @lg:grid"
        aria-hidden="true"
      >
        <span>Date</span>
        <span>Income or bill</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Balance after</span>
      </div>
      {earlier > 0 && (
        <Note>{`${earlier} earlier ${plural(earlier)} before your projection start.`}</Note>
      )}
      {shown.map(({ key, week }) => {
        const events = week.eventIds.map((id) => eventsById.get(id)).filter((e): e is LedgerEvent => !!e);
        return (
          <section
            key={key}
            data-testid={`week-register-${key}`}
            aria-label={`Week of ${fmtRange(week.rangeStart, week.rangeEnd)}`}
            className={clsx("overflow-hidden rounded-sheet border bg-sheet", week.hasNegative ? "border-rose-300" : "border-slate-300")}
          >
            <WeekHeader week={week} currency={currency} onSelect={onSelectWeek} />
            {events.length === 0 ? (
              <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">No income or bills</p>
            ) : (
              <ul className="border-t border-slate-200">
                {events.map((e) => (
                  <RegisterRow key={e.id} event={e} currency={currency} onSelect={onSelectEvent} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {later > 0 && <Note>{`${later} later ${plural(later)} beyond the 12-month forecast limit.`}</Note>}
    </section>
  );
}
