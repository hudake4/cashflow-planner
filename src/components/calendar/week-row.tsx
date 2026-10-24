"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, CircleCheck, TriangleAlert } from "lucide-react";
import type { DaySummary, LedgerEvent, WeekSummary } from "@/contracts/api";
import { fmtDate, fmtDayLong, fmtRange } from "@/lib/dates";
import { money, signedMoney, spokenKindMoney } from "@/lib/format";
import { Balance, EventAmount } from "@/components/ui/money";

export type DayState = "projected" | "before-start" | "beyond-range";

export interface DayView {
  date: string;
  state: DayState;
  summary?: DaySummary;
  events: LedgerEvent[];
  inMonth: boolean;
  isToday: boolean;
}

const MAX_EVENTS_IN_CELL = 3;

export function eventStatusText(event: LedgerEvent): string {
  if (event.status === "SKIPPED") return "Skipped";
  if (event.status === "PAID") return "Paid";
  return "";
}

export function eventAriaLabel(event: LedgerEvent, currency: string): string {
  const parts = [
    event.name,
    event.kind === "INCOME" ? "income" : "bill",
    spokenKindMoney(event.kind, event.amountCents, currency),
    `on ${fmtDayLong(event.date)}`,
  ];
  const status = eventStatusText(event);
  if (status) parts.push(status === "Skipped" ? "Skipped, not counted" : status);
  if (event.amountOverridden) parts.push("amount changed for this date");
  parts.push(`${event.balanceAfterCents < 0 ? "negative balance" : "balance"} after ${money(event.balanceAfterCents, currency)}`);
  return parts.join(", ");
}

function dayAriaLabel(day: DayView, currency: string): string {
  const head = fmtDayLong(day.date);
  if (day.state === "before-start") return `${head}: before projection start`;
  if (day.state === "beyond-range") return `${head}: beyond the 12-month forecast limit`;
  const events = day.events.length
    ? day.events
        .map((e) => `${e.name} ${spokenKindMoney(e.kind, e.amountCents, currency)}${e.status === "SKIPPED" ? " (skipped)" : e.status === "PAID" ? " (paid)" : ""}`)
        .join("; ")
    : "no events";
  const close = day.summary?.closingBalanceCents;
  const bal = close === undefined ? "" : `, ${close < 0 ? "negative balance" : "balance"} ${money(close, currency)}`;
  return `${head}: ${events}${bal}`;
}

/** A compact event button used inside day cells. */
export function EventChip({
  event,
  currency,
  onSelect,
  wrap = false,
}: {
  event: LedgerEvent;
  currency: string;
  onSelect: (event: LedgerEvent) => void;
  /** Show the full name (week view) instead of truncating. */
  wrap?: boolean;
}) {
  const skipped = event.status === "SKIPPED";
  const Icon = event.kind === "INCOME" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      data-testid={`event-${event.id}`}
      data-kind={event.kind}
      data-status={event.status}
      aria-label={eventAriaLabel(event, currency)}
      onClick={() => onSelect(event)}
      className={clsx(
        "font-narrow group flex w-full min-w-0 gap-1 rounded-chip border border-l-[3px] px-1.5 py-1 text-left text-xs transition-colors",
        wrap ? "flex-wrap items-center" : "items-center",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600",
        skipped
          ? "border-dashed border-slate-300 border-l-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
          : event.kind === "INCOME"
            ? "border-slate-200 border-l-emerald-700 bg-field hover:bg-emerald-50"
            : "border-slate-200 border-l-rose-700 bg-field hover:bg-rose-50",
      )}
    >
      <Icon
        className={clsx("h-3 w-3 shrink-0", skipped ? "text-slate-400" : event.kind === "INCOME" ? "text-emerald-700" : "text-rose-700")}
        aria-hidden="true"
      />
      <span className={clsx("min-w-0 flex-1 font-medium text-slate-800", wrap ? "break-words" : "truncate", skipped && "text-slate-500 line-through")}>
        {event.name}
      </span>
      {event.status === "PAID" && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-chip bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">
          <CircleCheck className="h-2.5 w-2.5" aria-hidden="true" />
          Paid
        </span>
      )}
      {skipped && <span className="shrink-0 rounded-chip bg-slate-200 px-1 text-[10px] font-semibold text-slate-700">Skipped</span>}
      <span
        className={clsx(
          "shrink-0 font-semibold tabular-nums",
          skipped ? "text-slate-500 line-through" : event.kind === "INCOME" ? "text-emerald-700" : "text-rose-700",
        )}
      >
        {event.kind === "INCOME" ? "+" : "−"}
        {money(event.amountCents, currency).replace(/^-/, "")}
      </span>
    </button>
  );
}

function DayCell({
  day,
  currency,
  expanded,
  onSelectEvent,
  onSelectDay,
}: {
  day: DayView;
  currency: string;
  expanded: boolean;
  onSelectEvent: (event: LedgerEvent) => void;
  onSelectDay: (day: DayView) => void;
}) {
  const visible = expanded ? day.events : day.events.slice(0, MAX_EVENTS_IN_CELL);
  const hidden = day.events.length - visible.length;
  const muted = day.state !== "projected";
  const negative = (day.summary?.closingBalanceCents ?? 0) < 0;
  const dayNumber = fmtDate(day.date, "d");

  return (
    <div
      data-testid={`day-cell-${day.date}`}
      data-state={day.state}
      className={clsx(
        "relative flex min-w-0 gap-2 border-slate-200 p-2 md:flex-col md:gap-1 md:p-1.5",
        "border-b md:border-r md:border-b-0 md:last:border-r-0",
        day.state !== "projected" ? "md:min-h-[4.5rem]" : expanded ? "md:min-h-[14rem]" : "md:min-h-[8.75rem]",
        muted ? "bg-slate-100/70 text-slate-500" : negative ? "bg-rose-50/60" : day.inMonth ? "bg-sheet" : "bg-slate-50",
        // On phones, hide event-less days in month view to keep the list scannable.
        !expanded && day.events.length === 0 && !day.isToday && "hidden md:flex",
      )}
    >
      <div className="flex w-14 shrink-0 flex-col items-start md:w-auto md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => onSelectDay(day)}
          disabled={muted}
          aria-label={dayAriaLabel(day, currency)}
          data-testid={`day-button-${day.date}`}
          className={clsx(
            "flex items-center gap-1 rounded-chip px-1 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-brand-600",
            !muted && "hover:bg-slate-100",
            !day.inMonth && !day.isToday && "text-slate-500",
            muted && "cursor-default",
          )}
        >
          <span className="text-xs font-medium text-slate-500 md:hidden">{fmtDate(day.date, "EEE")}</span>
          <span
            className={clsx(
              "inline-flex h-6 min-w-6 items-center justify-center tabular-nums",
              day.isToday && "highlight px-1.5 text-slate-900",
            )}
          >
            {dayNumber}
          </span>
          {day.inMonth || expanded ? null : <span className="text-xs font-normal">{fmtDate(day.date, "MMM")}</span>}
        </button>
        {day.isToday && <span className="px-1 text-[11px] font-semibold text-slate-700">Today</span>}
      </div>

      {day.state === "before-start" ? (
        <p className="text-[11px] leading-tight text-slate-500 md:px-1">Before projection start</p>
      ) : day.state === "beyond-range" ? (
        <p className="text-[11px] leading-tight text-slate-500 md:px-1">Beyond 12-month forecast limit</p>
      ) : (
        <>
          <ul className="flex min-w-0 flex-1 flex-col gap-1" aria-label={`Events on ${fmtDayLong(day.date)}`}>
            {visible.map((e) => (
              <li key={e.id} className="min-w-0">
                <EventChip event={e} currency={currency} onSelect={onSelectEvent} wrap={expanded} />
              </li>
            ))}
            {hidden > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  data-testid={`day-more-${day.date}`}
                  aria-label={`Show all ${day.events.length} events on ${fmtDayLong(day.date)}`}
                  className="rounded-chip px-1.5 text-xs font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  +{hidden} more
                </button>
              </li>
            )}
          </ul>
          {day.summary && (
            <div className="flex shrink-0 flex-col items-end justify-end text-right md:mt-auto md:flex-row md:items-baseline md:justify-between md:px-1">
              <span className="text-[11px] text-slate-500">End</span>
              <Balance
                cents={day.summary.closingBalanceCents}
                currency={currency}
                className="text-xs text-slate-700"
                iconClassName="h-3 w-3"
                testId={`day-balance-${day.date}`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WeekSummaryStrip({
  week,
  currency,
  onSelect,
}: {
  week: WeekSummary;
  currency: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span className="font-semiwide text-xs font-bold text-slate-800">
        Week of {fmtDate(week.weekStart, "MMM d")}
        {week.partial && <span className="ml-1 font-normal text-slate-500">(partial)</span>}
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
          <Balance
            cents={week.closingBalanceCents}
            currency={currency}
            className="text-sm font-semibold text-slate-900"
            testId={`week-closing-${week.weekStart}`}
          />
        </span>
        {week.hasNegative && (
          <span className="flex items-center gap-1 font-medium text-rose-700" data-testid={`week-negative-${week.weekStart}`}>
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Dips below zero (low {money(week.lowestBalanceCents, currency)})
          </span>
        )}
      </span>
    </>
  );

  const className = clsx(
    "flex w-full flex-col gap-1.5 px-3 py-2 text-left sm:flex-row sm:items-center sm:justify-between",
    week.hasNegative ? "bg-rose-50" : "bg-slate-50",
  );

  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`week-summary-${week.weekStart}`}
      aria-label={`Week of ${fmtRange(week.rangeStart, week.rangeEnd)}: opening ${money(week.openingBalanceCents, currency)}, income ${money(week.incomeCents, currency)}, bills ${money(week.billsCents, currency)}, closing ${week.closingBalanceCents < 0 ? "negative balance " : ""}${money(week.closingBalanceCents, currency)}. Open week details.`}
      className={clsx(className, "group transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600")}
    >
      {content}
      <span className="hidden items-center gap-0.5 text-xs font-medium text-brand-700 group-hover:underline sm:inline-flex" aria-hidden="true">
        Details <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export function WeekRow({
  weekStart,
  days,
  week,
  currency,
  expanded = false,
  onSelectEvent,
  onSelectDay,
  onSelectWeek,
}: {
  weekStart: string;
  days: DayView[];
  week?: WeekSummary;
  currency: string;
  expanded?: boolean;
  onSelectEvent: (event: LedgerEvent) => void;
  onSelectDay: (day: DayView) => void;
  onSelectWeek: (week: WeekSummary) => void;
}) {
  const anyEvents = days.some((d) => d.events.length > 0 || d.isToday);
  const allMuted = days.every((d) => d.state !== "projected");
  return (
    <section
      data-testid={`week-row-${weekStart}`}
      aria-label={`Week of ${fmtRange(days[0].date, days[6].date)}`}
      className={clsx(
        "overflow-hidden rounded-sheet border bg-sheet md:rounded-none md:border-0 md:border-b md:last:border-b-0",
        week?.hasNegative ? "border-rose-300" : "border-slate-200",
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((d) => (
          <DayCell key={d.date} day={d} currency={currency} expanded={expanded} onSelectEvent={onSelectEvent} onSelectDay={onSelectDay} />
        ))}
        {!expanded && !anyEvents && !allMuted && (
          <p className="px-3 py-2 text-xs text-slate-500 md:hidden">
            {fmtRange(days[0].date, days[6].date)}: no income or bills
          </p>
        )}
      </div>
      <div className="border-t border-slate-200">
        {week ? (
          <WeekSummaryStrip week={week} currency={currency} onSelect={() => onSelectWeek(week)} />
        ) : (
          <div className="bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {fmtRange(days[0].date, days[6].date)}:{" "}
            {days.every((d) => d.state === "before-start") ? "before projection start" : "outside the forecast range"}
          </div>
        )}
      </div>
    </section>
  );
}
