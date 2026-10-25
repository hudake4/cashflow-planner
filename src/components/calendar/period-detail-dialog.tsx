"use client";

import { clsx } from "clsx";
import { ChevronRight, TriangleAlert } from "lucide-react";
import type { LedgerEvent } from "@/contracts/api";
import { fmtDate, fmtDayShort } from "@/lib/dates";
import { money, signedMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Balance, EventAmount } from "@/components/ui/money";
import { eventAriaLabel } from "./event-labels";
import { weekCoverage, weekLabel } from "./week-label";

/** Everything needed to show a week or a day; all values come straight from the API. */
export interface PeriodDetail {
  kind: "week" | "day";
  key: string;
  from: string;
  to: string;
  partial?: boolean;
  openingBalanceCents: number;
  incomeCents: number;
  billsCents: number;
  netCents: number;
  closingBalanceCents: number;
  lowestBalanceCents?: number;
  hasNegative?: boolean;
  eventIds: string[];
}

export function PeriodDetailDialog({
  detail,
  eventsById,
  currency,
  onClose,
  restoreFocusOnClose,
  onSelectEvent,
}: {
  detail: PeriodDetail | null;
  eventsById: Map<string, LedgerEvent>;
  currency: string;
  onClose: () => void;
  restoreFocusOnClose?: boolean;
  onSelectEvent: (event: LedgerEvent) => void;
}) {
  const events = detail ? detail.eventIds.map((id) => eventsById.get(id)).filter((e): e is LedgerEvent => !!e) : [];
  const title = detail ? (detail.kind === "week" ? weekLabel(detail.key) : fmtDate(detail.from, "EEEE, MMMM d, yyyy")) : "";
  const summary = detail?.partial ? "Partial week: the projection starts partway through this week." : "Every event in order, with the running balance.";
  // The title names the calendar week; the dates it actually covers go here.
  const description = detail?.kind === "week" ? `${weekCoverage({ rangeStart: detail.from, rangeEnd: detail.to })}. ${summary}` : summary;

  return (
    <Dialog
      restoreFocusOnClose={restoreFocusOnClose}
      open={detail !== null}
      onClose={onClose}
      variant="drawer"
      title={title}
      description={description}
      testId={detail?.kind === "day" ? "day-detail" : "week-detail"}
    >
      {detail && (
        <div className="space-y-5">
          {detail.hasNegative && (
            <p role="alert" className="flex items-start gap-2 rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Balance drops below zero this week (lowest {money(detail.lowestBalanceCents ?? 0, currency)}).
            </p>
          )}

          <ol className="relative space-y-0" aria-label="Ledger">
            <li className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <span className="text-sm font-medium text-slate-700">Opening balance</span>
              <Balance cents={detail.openingBalanceCents} currency={currency} className="font-semibold" testId="detail-opening" />
            </li>
            {events.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No income or bills in this period.</li>}
            {events.map((e) => {
              const skipped = e.status === "SKIPPED";
              return (
                <li key={e.id} className="border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => onSelectEvent(e)}
                    aria-label={eventAriaLabel(e, currency)}
                    data-testid={`ledger-${e.id}`}
                    className="group flex w-full items-center gap-3 rounded-chip px-1 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    <span className="block min-w-0 flex-1">
                      <span className={clsx("block truncate text-sm font-medium text-slate-900", skipped && "text-slate-500 line-through")}>{e.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {detail.kind === "week" && <span>{fmtDayShort(e.date)}</span>}
                        {e.status === "PAID" && <Badge tone="positive">Paid</Badge>}
                        {skipped && <Badge tone="neutral">Skipped, not counted</Badge>}
                        {e.amountOverridden && <Badge tone="info">Adjusted</Badge>}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <EventAmount kind={e.kind} amountCents={e.amountCents} currency={currency} muted={skipped} className={clsx("text-sm", skipped && "line-through")} />
                      <span className="text-xs text-slate-500">
                        <span className="sr-only">Balance after: </span>
                        <Balance cents={e.balanceAfterCents} currency={currency} iconClassName="h-3 w-3" testId={`ledger-balance-${e.id}`} />
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>

          <dl className="divide-y divide-border border-t border-border text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
              <dt className="font-medium text-muted-foreground">Income</dt>
              <dd className="text-right tabular-nums">
                <EventAmount kind="INCOME" amountCents={detail.incomeCents} currency={currency} />
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
              <dt className="font-medium text-muted-foreground">Bills</dt>
              <dd className="text-right tabular-nums">
                <EventAmount kind="BILL" amountCents={detail.billsCents} currency={currency} />
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
              <dt className="font-medium text-muted-foreground">Net change</dt>
              <dd className={clsx("text-right font-medium tabular-nums", detail.netCents < 0 ? "text-rose-700" : detail.netCents > 0 ? "text-emerald-700" : "text-foreground")}>
                {signedMoney(detail.netCents, currency)}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-3">
              <dt className="font-semibold text-foreground">Closing balance</dt>
              <dd className="text-right text-lg font-semibold tabular-nums">
                <Balance cents={detail.closingBalanceCents} currency={currency} iconClassName="h-4 w-4" testId="detail-closing" />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">
            Projected balance assumes all scheduled income arrives and all listed bills are paid on time.
          </p>
        </div>
      )}
    </Dialog>
  );
}
