"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CalendarView, LedgerEvent, ProjectionResponse, SettingsDTO, WeekSummary } from "@/contracts/api";
import { api } from "@/lib/api-client";
import {
  WEEKDAY_NAMES,
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  fmtDate,
  fmtRange,
  startOfMonth,
  startOfWeek,
  todayLocal,
} from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { EditSourceDialog } from "@/components/forms/edit-source-dialog";
import type { ScheduleKind } from "@/components/forms/schedule-form-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { EventDetailDialog } from "./event-detail-dialog";
import { PeriodDetailDialog, type PeriodDetail } from "./period-detail-dialog";
import { WeekRow, type DayView } from "./week-row";

export function CalendarPage() {
  const settings = useApi<SettingsDTO>("settings", api.getSettings);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Projected balance day by day and week by week. Select a week for its full ledger, or an event to update it."
      />
      {settings.error && !settings.data ? (
        <ErrorState message={settings.error} onRetry={settings.reload} />
      ) : !settings.data ? (
        <CalendarSkeleton />
      ) : (
        <CalendarBody settings={settings.data} />
      )}
    </>
  );
}

function CalendarSkeleton() {
  return (
    <LoadingRegion label="Loading calendar">
      <Card className="overflow-hidden">
        <div className="flex gap-2 border-b border-slate-200 p-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="ml-auto h-9 w-48" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-slate-200 p-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </Card>
    </LoadingRegion>
  );
}

function CalendarBody({ settings }: { settings: SettingsDTO }) {
  const weekStartsOn = settings.weekStartsOn;
  const today = todayLocal();
  const [view, setView] = useState<CalendarView>(settings.defaultCalendarView);
  const [cursor, setCursor] = useState<string>(today);
  const [jump, setJump] = useState("");

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodDetail | null>(null);
  const [editTarget, setEditTarget] = useState<{ kind: ScheduleKind; id: string } | null>(null);

  // Visible grid (always whole weeks so the API returns full week summaries).
  const grid = useMemo(() => {
    if (view === "week") {
      const from = startOfWeek(cursor, weekStartsOn);
      return { from, to: addDays(from, 6), month: cursor.slice(0, 7) };
    }
    const from = startOfWeek(startOfMonth(cursor), weekStartsOn);
    const to = addDays(startOfWeek(endOfMonth(cursor), weekStartsOn), 6);
    return { from, to, month: cursor.slice(0, 7) };
  }, [view, cursor, weekStartsOn]);

  const projectionStart = settings.projectionStartDate;
  const maxEnd = addDays(projectionStart, 365);
  const fetchFrom = grid.from < projectionStart ? projectionStart : grid.from;
  const fetchTo = grid.to > maxEnd ? maxEnd : grid.to;
  const canFetch = fetchFrom <= fetchTo;

  const projectionKey = canFetch ? `projection:${fetchFrom}:${fetchTo}` : null;
  const projection = useApi<ProjectionResponse>(projectionKey, () =>
    api.getProjection({ from: fetchFrom, to: fetchTo }),
  );
  const data = canFetch ? projection.data : undefined;
  const currency = data?.currency ?? settings.currency;
  // Only trust data whose range matches what we asked for (avoids flashing stale numbers on navigation).
  const fresh = data && projection.dataKey === projectionKey ? data : undefined;

  const eventsById = useMemo(() => new Map((fresh?.events ?? []).map((e) => [e.id, e])), [fresh]);
  const daysByDate = useMemo(() => new Map((fresh?.days ?? []).map((d) => [d.date, d])), [fresh]);
  const weeksByStart = useMemo(() => new Map((fresh?.weeks ?? []).map((w) => [w.weekStart, w])), [fresh]);

  const weeks = useMemo(() => {
    const rows: { weekStart: string; days: DayView[] }[] = [];
    const all = eachDay(grid.from, grid.to);
    for (let i = 0; i < all.length; i += 7) {
      const days = all.slice(i, i + 7).map<DayView>((date) => {
        const summary = daysByDate.get(date);
        const state = date < projectionStart ? "before-start" : date > maxEnd ? "beyond-range" : "projected";
        return {
          date,
          state,
          summary,
          events: summary ? summary.eventIds.map((id) => eventsById.get(id)).filter((e): e is LedgerEvent => !!e) : [],
          inMonth: view === "week" || date.slice(0, 7) === grid.month,
          isToday: date === today,
        };
      });
      rows.push({ weekStart: all[i], days });
    }
    return rows;
  }, [grid, daysByDate, eventsById, projectionStart, maxEnd, view, today]);

  const selectedEvent = selectedEventId ? (eventsById.get(selectedEventId) ?? null) : null;

  const step = (dir: -1 | 1) => {
    setCursor((c) => (view === "week" ? addDays(c, 7 * dir) : addMonths(c, dir)));
  };

  const title = view === "month" ? fmtDate(`${grid.month}-01`, "MMMM yyyy") : fmtRange(grid.from, grid.to);
  const headerDays = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(weekStartsOn + i) % 7]);

  const openWeek = (w: WeekSummary) =>
    setPeriod({
      kind: "week",
      key: w.weekStart,
      from: w.rangeStart,
      to: w.rangeEnd,
      partial: w.partial,
      openingBalanceCents: w.openingBalanceCents,
      incomeCents: w.incomeCents,
      billsCents: w.billsCents,
      netCents: w.netCents,
      closingBalanceCents: w.closingBalanceCents,
      lowestBalanceCents: w.lowestBalanceCents,
      hasNegative: w.hasNegative,
      eventIds: w.eventIds,
    });

  const openDay = (d: DayView) => {
    if (!d.summary) return;
    const s = d.summary;
    setPeriod({
      kind: "day",
      key: s.date,
      from: s.date,
      to: s.date,
      openingBalanceCents: s.openingBalanceCents,
      incomeCents: s.incomeCents,
      billsCents: s.billsCents,
      netCents: s.netCents,
      closingBalanceCents: s.closingBalanceCents,
      eventIds: s.eventIds,
    });
  };

  // Keep an open week/day panel in sync with refetched data.
  const livePeriod = useMemo<PeriodDetail | null>(() => {
    if (!period || !fresh) return period;
    if (period.kind === "week") {
      const w = weeksByStart.get(period.key);
      return w
        ? { ...period, ...pickWeek(w) }
        : period;
    }
    const d = daysByDate.get(period.key);
    return d
      ? {
          ...period,
          openingBalanceCents: d.openingBalanceCents,
          incomeCents: d.incomeCents,
          billsCents: d.billsCents,
          netCents: d.netCents,
          closingBalanceCents: d.closingBalanceCents,
          eventIds: d.eventIds,
        }
      : period;
  }, [period, fresh, weeksByStart, daysByDate]);

  const visibleNegative = (fresh?.weeks ?? []).find((w) => w.hasNegative);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"} data-testid="calendar-prev">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label={view === "month" ? "Next month" : "Next week"} data-testid="calendar-next">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
          <h2 className="font-semiwide min-w-0 truncate text-xl font-bold text-slate-900" aria-live="polite" data-testid="calendar-title">
            {title}
          </h2>
          {projection.refreshing && (
            <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" aria-label="Updating" data-testid="calendar-refreshing" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCursor(today)} data-testid="calendar-today">
            Today
          </Button>
          <div role="group" aria-label="Calendar view" className="inline-flex rounded-control border border-slate-300 bg-sheet p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                data-testid={`calendar-view-${v}`}
                className={clsx(
                  "rounded-chip px-3 py-1 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-brand-600",
                  view === v ? "bg-slate-900 text-on-accent" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{4}-\d{2}-\d{2}$/.test(jump)) setCursor(jump);
            }}
          >
            <label htmlFor="calendar-jump" className="sr-only">
              Jump to date
            </label>
            <Input
              id="calendar-jump"
              type="date"
              value={jump}
              onChange={(e) => {
                setJump(e.target.value);
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setCursor(e.target.value);
              }}
              className="h-8 w-[9.5rem]"
              data-testid="calendar-jump"
            />
            <Button type="submit" size="sm" variant="ghost" data-testid="calendar-jump-go">
              Go
            </Button>
          </form>
        </div>
      </Card>

      {visibleNegative && (
        <p role="alert" className="flex items-start gap-2 rounded-sheet border border-rose-200 border-l-4 border-l-rose-700 bg-rose-50 px-4 py-3 text-sm text-rose-900" data-testid="calendar-negative-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Heads up:</strong> your projected balance dips below zero in the week of{" "}
            {fmtDate(visibleNegative.weekStart, "MMM d")}.
          </span>
        </p>
      )}

      {canFetch && projection.error && !fresh ? (
        <ErrorState message={projection.error} onRetry={projection.reload} />
      ) : (
        <div
          className={clsx(
            "md:overflow-hidden md:rounded-sheet md:border md:border-slate-300 md:bg-sheet",
            canFetch && !fresh && "opacity-60",
          )}
          aria-busy={canFetch && !fresh}
          data-testid={`calendar-${view}`}
        >
          <div className="hidden grid-cols-7 border-b border-slate-300 bg-slate-50 md:grid" aria-hidden="true">
            {headerDays.map((d) => (
              <div key={d} className="px-2.5 py-2 text-xs font-semibold text-slate-600">
                {d.slice(0, 3)}
              </div>
            ))}
          </div>
          <div className="space-y-3 md:space-y-0">
            {!canFetch && (
              <p className="rounded-sheet bg-sheet p-4 text-sm text-slate-600 md:rounded-none md:border-b md:border-slate-200">
                {grid.to < projectionStart
                  ? "These dates are before your projection start date, so there's no projected balance yet."
                  : "These dates are beyond the 12-month forecast limit."}{" "}
                <Link href="/settings" className="font-medium text-brand-700 underline">
                  Change projection settings
                </Link>
              </p>
            )}
            {weeks.map((w) => (
              <WeekRow
                key={w.weekStart}
                weekStart={w.weekStart}
                days={w.days}
                week={weeksByStart.get(w.weekStart)}
                currency={currency}
                expanded={view === "week"}
                onSelectEvent={(e) => setSelectedEventId(e.id)}
                onSelectDay={openDay}
                onSelectWeek={openWeek}
              />
            ))}
          </div>
        </div>
      )}

      <Legend />

      <PeriodDetailDialog
        detail={livePeriod}
        eventsById={eventsById}
        currency={currency}
        onClose={() => setPeriod(null)}
        onSelectEvent={(e) => setSelectedEventId(e.id)}
      />
      <EventDetailDialog
        event={selectedEvent}
        currency={currency}
        onClose={() => setSelectedEventId(null)}
        onChanged={projection.reload}
        onEditSource={(e) => {
          setSelectedEventId(null);
          setPeriod(null);
          setEditTarget({ kind: e.kind === "BILL" ? "bill" : "income", id: e.sourceId });
        }}
      />
      <EditSourceDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => void projection.reload()} />
    </div>
  );
}

function pickWeek(w: WeekSummary) {
  return {
    from: w.rangeStart,
    to: w.rangeEnd,
    partial: w.partial,
    openingBalanceCents: w.openingBalanceCents,
    incomeCents: w.incomeCents,
    billsCents: w.billsCents,
    netCents: w.netCents,
    closingBalanceCents: w.closingBalanceCents,
    lowestBalanceCents: w.lowestBalanceCents,
    hasNegative: w.hasNegative,
    eventIds: w.eventIds,
  };
}

function Legend() {
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
        <li className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3 text-emerald-700" aria-hidden="true" /> Income (+)
        </li>
        <li className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3 text-rose-700" aria-hidden="true" /> Bill (−)
        </li>
        <li className="flex items-center gap-1">
          <TriangleAlert className="h-3 w-3 text-rose-700" aria-hidden="true" /> Negative balance
        </li>
        <li>
          <span className="line-through">Struck through</span> = skipped, not counted
        </li>
        <li>“End” = projected end-of-day balance</li>
      </ul>
      <p>Projected balance assumes all scheduled income arrives and all listed bills are paid on time.</p>
    </div>
  );
}
