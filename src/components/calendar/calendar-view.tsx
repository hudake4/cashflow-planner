"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BillDTO, CalendarView, IncomeDTO, LedgerEvent, ProjectionResponse, ScenarioInput, SettingsDTO, WeekSummary } from "@/contracts/api";
import { effectiveProjectionStartDate, startDateFromAccounts } from "@/domain/starting-balance";
import { api } from "@/lib/api-client";
import { addDays, addMonths, eachDay, endOfMonth, fmtDate, fmtRange, startOfMonth, startOfWeek, todayLocal } from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { EditSourceDialog } from "@/components/forms/edit-source-dialog";
import type { ScheduleKind } from "@/components/forms/schedule-form-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScenarioDialog } from "@/components/scenario/scenario-dialog";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { CalendarToolbar } from "./calendar-toolbar";
import { EventDetailDialog } from "./event-detail-dialog";
import { ExportMenu, summaryMonth } from "./export-menu";
import { HeatmapCalendar, type DayView, type GridWeek } from "./heatmap-calendar";
import { PeriodDetailDialog, type PeriodDetail } from "./period-detail-dialog";
import { RegisterList } from "./register-list";
import { weekStartText } from "./week-label";

export function CalendarPage() {
  const settings = useApi<SettingsDTO>("settings", api.getSettings);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Projected balance day by day, with a running register by week. Select a day or week for its ledger, or an event to update it."
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

const LAYOUT_CLASS = "space-y-4 lg:grid lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 xl:grid-cols-[25rem_minmax(0,1fr)]";

function CalendarRangeSkeleton() {
  return (
    <div className={LAYOUT_CLASS}>
      <Skeleton className="h-80 w-full" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <LoadingRegion label="Loading calendar">
      <div className="space-y-4">
        <Card className="flex gap-2 p-3">
          <Skeleton className="h-11 w-40" />
          <Skeleton className="ml-auto h-11 w-48" />
        </Card>
        <CalendarRangeSkeleton />
      </div>
    </LoadingRegion>
  );
}

function CalendarBody({ settings }: { settings: SettingsDTO }) {
  const weekStartsOn = settings.weekStartsOn;
  const today = todayLocal();
  const [view, setView] = useState<CalendarView>(settings.defaultCalendarView);
  const [cursor, setCursor] = useState<string>(today);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodDetail | null>(null);
  const [editTarget, setEditTarget] = useState<{ kind: ScheduleKind; id: string } | null>(null);
  const [scenario, setScenario] = useState<ScenarioInput | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bills, setBills] = useState<BillDTO[]>([]);
  const [incomes, setIncomes] = useState<IncomeDTO[]>([]);
  const periodTrigger = useRef<HTMLElement | null>(null);
  const editFocusTarget = useRef<HTMLElement | null>(null);
  const lastEventTrigger = useRef<HTMLElement | null>(null);

  const selectEvent = (event: LedgerEvent) => {
    lastEventTrigger.current = activeElement();
    setSelectedEventId(event.id);
  };

  const closeEvent = () => {
    setSelectedEventId(null);
  };

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

  const projectionStart = effectiveProjectionStartDate(settings);
  const maxEnd = addDays(projectionStart, 365);
  const fetchFrom = grid.from < projectionStart ? projectionStart : grid.from;
  const fetchTo = grid.to > maxEnd ? maxEnd : grid.to;
  const canFetch = fetchFrom <= fetchTo;

  // The export covers the period named in the title (the month, not the padded weeks around it),
  // cut to the projection window so it never holds dates without a balance.
  const periodFrom = view === "month" ? startOfMonth(cursor) : grid.from;
  const periodTo = view === "month" ? endOfMonth(cursor) : grid.to;
  const exportRange = { from: periodFrom < projectionStart ? projectionStart : periodFrom, to: periodTo > maxEnd ? maxEnd : periodTo };

  const projectionKey = canFetch ? `projection:${fetchFrom}:${fetchTo}` : null;
  const projection = useApi<ProjectionResponse>(projectionKey, () => api.getProjection({ from: fetchFrom, to: fetchTo }));
  const scenarioKey = scenario ? JSON.stringify(scenario) : null;
  const scenarioProjection = useApi<ProjectionResponse>(
    scenarioKey && canFetch ? `projection:scenario:${scenarioKey}:${fetchFrom}:${fetchTo}` : null,
    () => api.getScenarioProjection(scenario!, { from: fetchFrom, to: fetchTo }),
  );
  const activeProjection = scenario ? scenarioProjection : projection;
  const activeKey = scenario
    ? scenarioKey && canFetch ? `projection:scenario:${scenarioKey}:${fetchFrom}:${fetchTo}` : null
    : projectionKey;
  const data = canFetch ? activeProjection.data : undefined;
  const currency = data?.currency ?? settings.currency;
  // Only trust data whose range matches what we asked for (avoids flashing stale numbers on navigation).
  const fresh = data && activeProjection.dataKey === activeKey ? data : undefined;

  const eventsById = useMemo(() => new Map((fresh?.events ?? []).map((e) => [e.id, e])), [fresh]);
  const daysByDate = useMemo(() => new Map((fresh?.days ?? []).map((d) => [d.date, d])), [fresh]);
  const weeksByStart = useMemo(() => new Map((fresh?.weeks ?? []).map((w) => [w.weekStart, w])), [fresh]);

  const weeks = useMemo(() => {
    const rows: GridWeek[] = [];
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

  useEffect(() => {
    if (!dialogOpen) return;
    void api.listBills().then(setBills).catch(() => setBills([]));
    void api.listIncome().then(setIncomes).catch(() => setIncomes([]));
  }, [dialogOpen]);

  const title = view === "month" ? fmtDate(`${grid.month}-01`, "MMMM yyyy") : fmtRange(grid.from, grid.to);

  const openWeek = (w: WeekSummary) => {
    periodTrigger.current = activeElement();
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
  };

  const openDay = (d: DayView) => {
    if (!d.summary) return;
    periodTrigger.current = activeElement();
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
      return w ? { ...period, ...pickWeek(w) } : period;
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

  const floor = settings.balanceFloorCents ?? 0;
  const visibleNegative = (fresh?.weeks ?? []).find((w) => w.lowestBalanceCents < floor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="what-if-button">What-if</Button>
        {scenario && <Badge data-testid="scenario-active">Scenario active</Badge>}
        {scenario && <Button size="sm" variant="outline" onClick={() => setScenario(null)} data-testid="scenario-clear">Clear scenario</Button>}
      </div>
      <CalendarToolbar
        view={view}
        title={title}
        refreshing={activeProjection.refreshing}
        onViewChange={setView}
        onStep={(dir) => setCursor((c) => (view === "week" ? addDays(c, 7 * dir) : addMonths(c, dir)))}
        onToday={() => setCursor(today)}
        onJump={setCursor}
        actions={<ExportMenu range={exportRange} month={summaryMonth(cursor, exportRange)} disabled={exportRange.from > exportRange.to} />}
      />

      {visibleNegative && (
        <p role="alert" className="flex items-start gap-2 rounded-sheet border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" data-testid="calendar-negative-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Heads up:</strong> your projected balance dips below zero in the week of{" "}
            {weekStartText(visibleNegative.weekStart)}.
          </span>
        </p>
      )}

      <div aria-busy={canFetch && !fresh && !activeProjection.error} data-testid={`calendar-${view}`}>
        {canFetch && activeProjection.error && !fresh ? (
          <ErrorState message={activeProjection.error} onRetry={activeProjection.reload} />
        ) : canFetch && !fresh ? (
          <LoadingRegion label="Loading projected calendar">
            <CalendarRangeSkeleton />
          </LoadingRegion>
        ) : (
          <div className="space-y-4">
            {!canFetch && (
              <p className="rounded-sheet bg-card p-4 text-sm text-muted-foreground">
                {grid.to < projectionStart
                  ? "These dates are before your projection start date, so there's no projected balance yet."
                  : "These dates are beyond the 12-month forecast limit."}{" "}
                <Link href="/settings" className="font-medium text-brand-700 underline">
                  Change projection settings
                </Link>
              </p>
            )}
            <div className={LAYOUT_CLASS}>
              <div className="lg:sticky lg:top-6">
                <HeatmapCalendar weeks={weeks} weekStartsOn={weekStartsOn} currency={currency} onSelectDay={openDay} />
              </div>
              <RegisterList
                weeks={weeks}
                weeksByStart={weeksByStart}
                eventsById={eventsById}
                currency={currency}
                showRangeNotes={canFetch}
                onSelectWeek={openWeek}
                onSelectEvent={selectEvent}
              />
            </div>
            <p className="text-xs text-slate-600">
              Projected balance assumes all scheduled income arrives and all listed bills are paid on time. Skipped bills are struck through and not counted.
            </p>
          </div>
        )}
      </div>

      <PeriodDetailDialog
        restoreFocusOnClose={editTarget === null}
        detail={livePeriod}
        eventsById={eventsById}
        currency={currency}
        onClose={() => setPeriod(null)}
        onSelectEvent={selectEvent}
      />
      <EventDetailDialog
        restoreFocusOnClose={editTarget === null}
        restoreFocusTarget={() => lastEventTrigger.current}
        event={selectedEvent}
        currency={currency}
        balanceFromAccounts={startDateFromAccounts(settings)}
        onClose={closeEvent}
        onChanged={activeProjection.reload}
        onEditSource={(e) => {
          editFocusTarget.current = period ? periodTrigger.current : lastEventTrigger.current;
          setSelectedEventId(null);
          setPeriod(null);
          setEditTarget({ kind: e.kind === "BILL" ? "bill" : "income", id: e.sourceId });
        }}
      />
      <EditSourceDialog restoreFocusTarget={() => editFocusTarget.current} target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => void activeProjection.reload()} />
      <ScenarioDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onApply={(s) => setScenario(s)} bills={bills} incomes={incomes} />
    </div>
  );
}

function activeElement(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
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
