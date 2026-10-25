"use client";

import { clsx } from "clsx";
import { TriangleAlert } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { DaySummary, LedgerEvent } from "@/contracts/api";
import { WEEKDAY_NAMES, fmtDate, fmtDayLong } from "@/lib/dates";
import { compactBalance, heatBackground, heatTint } from "@/lib/calendar-heatmap";
import { money, spokenKindMoney } from "@/lib/format";

export type DayState = "projected" | "before-start" | "beyond-range";

export interface DayView {
  date: string;
  state: DayState;
  summary?: DaySummary;
  events: LedgerEvent[];
  inMonth: boolean;
  isToday: boolean;
}

export interface GridWeek {
  weekStart: string;
  days: DayView[];
}

const MAX_DOTS = 3;

function dayAriaLabel(day: DayView, currency: string): string {
  const head = `${fmtDayLong(day.date)}${day.isToday ? " (today)" : ""}`;
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

/** Up to three dots for the day's counted events: income first, then bills. */
function eventDots(events: LedgerEvent[]): ("INCOME" | "BILL")[] {
  const counted = events.filter((e) => e.included);
  return [...counted.filter((e) => e.kind === "INCOME"), ...counted.filter((e) => e.kind === "BILL")].slice(0, MAX_DOTS).map((e) => e.kind);
}

function KindDot({ kind }: { kind: "INCOME" | "BILL" }) {
  return (
    <span
      aria-hidden="true"
      data-dot={kind}
      className={clsx("size-1.5 shrink-0", kind === "INCOME" ? "rounded-full bg-emerald-700" : "rounded-[1px] bg-rose-700")}
    />
  );
}

function DayCell({ day, currency, maxPositiveCents, onSelect }: { day: DayView; currency: string; maxPositiveCents: number; onSelect: (day: DayView) => void }) {
  const projected = day.state === "projected" && day.summary !== undefined;
  const closing = day.summary?.closingBalanceCents ?? 0;
  const negative = projected && closing < 0;
  const dots = projected ? eventDots(day.events) : [];

  return (
    <div data-testid={`day-cell-${day.date}`} data-state={day.state} data-today={day.isToday || undefined} className="min-w-0">
      <button
        type="button"
        disabled={!projected}
        onClick={() => onSelect(day)}
        aria-label={dayAriaLabel(day, currency)}
        data-testid={`day-button-${day.date}`}
        style={projected ? { backgroundColor: heatBackground(heatTint(closing, maxPositiveCents)) } : undefined}
        className={clsx(
          "flex h-full min-h-14 w-full min-w-0 flex-col justify-between gap-0.5 rounded-control border px-0.5 py-1 text-left transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600",
          projected
            ? "cursor-pointer border-slate-200 text-slate-900 hover:border-slate-400"
            : "cursor-default border-transparent bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--color-slate-100)_5px_6px)] text-slate-500",
          day.isToday && "border-transparent ring-2 ring-brand-600 ring-inset",
          projected && !day.inMonth && "opacity-60",
        )}
      >
        <span className="flex items-center justify-between gap-0.5">
          <span
            className={clsx(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-chip px-0.5 text-xs font-bold tabular-nums",
              day.isToday && "highlight text-slate-900",
            )}
          >
            {fmtDate(day.date, "d")}
          </span>
          {negative && <TriangleAlert className="size-3 shrink-0 text-rose-700" aria-hidden="true" />}
        </span>
        {projected ? (
          <>
            <span
              aria-hidden="true"
              className={clsx("block text-[10px] leading-3 font-semibold @min-[20.5rem]:text-[11px] whitespace-nowrap tabular-nums", negative ? "text-rose-800" : "text-slate-800")}
            >
              <span className="@min-[20.5rem]:hidden">{compactBalance(closing, currency, true)}</span>
              <span className="hidden @min-[20.5rem]:inline">{compactBalance(closing, currency)}</span>
            </span>
            <span className="sr-only" data-testid={`day-balance-${day.date}`}>
              {money(closing, currency)}
            </span>
            <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
              {dots.map((kind, i) => (
                <KindDot key={i} kind={kind} />
              ))}
            </span>
          </>
        ) : null}
      </button>
    </div>
  );
}

function Swatch({ tone, alpha, children }: { tone: "positive" | "negative"; alpha: number; children?: ReactNode }) {
  return (
    <span
      className="inline-flex size-4 items-center justify-center rounded-chip border border-slate-300"
      style={{ backgroundColor: heatBackground({ tone, alpha }) }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function HeatmapLegend() {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <Swatch tone="negative" alpha={0.3}>
          <TriangleAlert className="size-2.5 text-rose-700" />
        </Swatch>
        Below zero
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-4 w-12 rounded-chip border border-slate-300"
          style={{ backgroundImage: `linear-gradient(to right, ${heatBackground({ tone: "positive", alpha: 0.05 })}, ${heatBackground({ tone: "positive", alpha: 0.2 })})` }}
          aria-hidden="true"
        />
        Low to healthy
      </li>
      <li className="flex items-center gap-1.5">
        <KindDot kind="INCOME" /> Income
      </li>
      <li className="flex items-center gap-1.5">
        <KindDot kind="BILL" /> Bill
      </li>
      <li className="basis-full">Each day shows its projected end-of-day balance.</li>
    </ul>
  );
}

/**
 * Compact month (or single week) calendar. Each day is tinted by its projected
 * end-of-day balance; selecting a day opens that day's ledger.
 */
export function HeatmapCalendar({
  weeks,
  weekStartsOn,
  currency,
  onSelectDay,
}: {
  weeks: GridWeek[];
  weekStartsOn: number;
  currency: string;
  onSelectDay: (day: DayView) => void;
}) {
  const maxPositiveCents = useMemo(() => {
    let max = 0;
    for (const w of weeks) for (const d of w.days) if (d.state === "projected" && d.summary && d.summary.closingBalanceCents > max) max = d.summary.closingBalanceCents;
    return max;
  }, [weeks]);
  // Below `lg` the hatched weeks that end before the projection start only push the register down the
  // screen, so they are hidden (the nodes stay in the DOM). Keep them when nothing else would be left.
  const collapsibleWeeks = useMemo(() => {
    const before = weeks.filter((w) => w.days.every((d) => d.state === "before-start"));
    return before.length === weeks.length ? new Set<string>() : new Set(before.map((w) => w.weekStart));
  }, [weeks]);
  const headerDays = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(weekStartsOn + i) % 7].slice(0, 3));

  return (
    <section aria-label="Balance calendar" className="@container rounded-sheet border border-slate-300 bg-sheet p-1 sm:p-3" data-testid="calendar-heatmap">
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1" aria-hidden="true">
        {headerDays.map((d) => (
          <div key={d} className="pb-1 text-center text-xs font-semibold text-slate-600">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {weeks.map((w) => {
          const collapsed = collapsibleWeeks.has(w.weekStart);
          return (
            <div
              key={w.weekStart}
              data-testid={`heatmap-week-${w.weekStart}`}
              data-week-collapsed-on-phone={collapsed || undefined}
              className={collapsed ? "hidden lg:contents" : "contents"}
            >
              {w.days.map((d) => (
                <DayCell key={d.date} day={d} currency={currency} maxPositiveCents={maxPositiveCents} onSelect={onSelectDay} />
              ))}
            </div>
          );
        })}
      </div>
      <HeatmapLegend />
    </section>
  );
}
