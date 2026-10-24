"use client";

import { clsx } from "clsx";
import { CalendarDays, HandCoins, Info, Receipt, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtDate, fmtDayShort, fmtRange, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Balance, EventAmount } from "@/components/ui/money";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TrendChart } from "./trend-chart";

const DISCLAIMER = "Projected balance assumes all scheduled income arrives and all listed bills are paid on time.";

const linkButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export function DashboardView() {
  const dash = useApi<DashboardResponse>("dashboard", api.getDashboard);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How much you'll have left each week after income and upcoming bills."
        actions={
          <Link href="/calendar" className={clsx(linkButton, "bg-brand-600 text-white hover:bg-brand-700")} data-testid="dashboard-open-calendar">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Open calendar
          </Link>
        }
      />
      {dash.error && !dash.data ? (
        <ErrorState message={dash.error} onRetry={dash.reload} />
      ) : !dash.data ? (
        <DashboardSkeleton />
      ) : (
        <DashboardContent d={dash.data} />
      )}
      <p className="mt-10 flex max-w-[80ch] items-start gap-2 text-xs leading-relaxed text-slate-600" data-testid="disclaimer">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {DISCLAIMER} Figures are projections from what you entered, not a live bank balance.
      </p>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-4">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-20 w-80 max-w-full" />
          <Skeleton className="h-4 w-72" />
          <div className="grid grid-cols-3 gap-4 pt-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </div>
        <Card className="space-y-4 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      </div>
      <Card className="mt-8 p-5">
        <Skeleton className="h-64 w-full" />
      </Card>
    </LoadingRegion>
  );
}

/** A secondary figure under the hero: label, value, one line of context. */
function Figure({ id, label, children, sub }: { id: string; label: string; children: ReactNode; sub: ReactNode }) {
  return (
    <div data-testid={`summary-card-${id}`} className="min-w-0 border-t border-slate-300 pt-3">
      <h2 className="text-sm font-semibold text-slate-600">
        {label}
      </h2>
      <div className="font-semiwide mt-1 text-xl font-bold tracking-tight text-slate-900" data-testid={`summary-value-${id}`}>
        {children}
      </div>
      <div className="mt-0.5 text-xs text-slate-600">{sub}</div>
    </div>
  );
}

/** One line of the register sum: operator, what it is, amount. */
function RegisterLine({
  id,
  op,
  label,
  sub,
  children,
  total = false,
}: {
  id: string;
  op: string;
  label: string;
  sub: ReactNode;
  children: ReactNode;
  total?: boolean;
}) {
  return (
    <div
      data-testid={`summary-card-${id}`}
      className={clsx("grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3", total ? "border-t-[3px] border-double border-slate-400" : "border-t border-slate-200 first:border-t-0")}
    >
      <span className="font-wide text-lg font-bold text-slate-400" aria-hidden="true">
        {op}
      </span>
      <div className="min-w-0">
        <h2 className={clsx("text-sm text-slate-900", total ? "font-bold" : "font-semibold")}>
          {label}
        </h2>
        <div className="mt-0.5 text-xs leading-snug text-slate-600">{sub}</div>
      </div>
      <div
        className={clsx("font-semiwide text-right whitespace-nowrap tabular-nums", total ? "text-xl font-bold" : "text-base font-semibold")}
        data-testid={`summary-value-${id}`}
      >
        {children}
      </div>
    </div>
  );
}

function DashboardContent({ d }: { d: DashboardResponse }) {
  const currency = d.settings.currency;
  const t = d.totals;

  if (!d.hasData) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Let's build your first projection"
          description="Add your paycheck and your bills, and CashFlow Planner will show what you'll have left at the end of each week. Everything stays on this computer."
          testId="dashboard-empty"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/income" className={clsx(linkButton, "bg-brand-600 text-white hover:bg-brand-700")}>
                <HandCoins className="h-4 w-4" aria-hidden="true" /> Add your first paycheck
              </Link>
              <Link href="/bills" className={clsx(linkButton, "border border-slate-300 bg-sheet text-slate-800 hover:border-slate-400")}>
                <Receipt className="h-4 w-4" aria-hidden="true" /> Add a bill
              </Link>
              <Link href="/settings" className={clsx(linkButton, "text-slate-700 hover:bg-slate-200/60")}>
                Set starting balance or load demo data
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const week = d.currentWeek;
  const weekNegative = !!week && week.closingBalanceCents < 0;

  return (
    <div className="space-y-8">
      {t.firstNegativeDate && (
        <div role="alert" className="flex items-start gap-3 rounded-sheet border border-rose-200 border-l-4 border-l-rose-700 bg-rose-50 p-4" data-testid="negative-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div className="text-sm text-rose-900">
            <p className="font-bold">Your balance is projected to go negative on {fmtDayShort(t.firstNegativeDate)}.</p>
            <p className="mt-0.5">
              Lowest point: {money(t.lowestBalanceCents, currency)} on {fmtShort(t.lowestBalanceDate)}
              {t.negativeDayCount > 0 && `, with ${t.negativeDayCount} day${t.negativeDayCount === 1 ? "" : "s"} below zero in the forecast`}.{" "}
              <Link href="/calendar" className="font-semibold underline">
                Review in calendar
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        {/* Hero: the one number the app exists to answer. */}
        <section aria-labelledby="this-week-heading" className="flex min-w-0 flex-col">
          <div data-testid="summary-card-end-of-this-week">
            <h2 id="this-week-heading" className="text-lg font-semibold text-slate-700">
              {week ? <>By {fmtDate(week.rangeEnd, "EEEE, MMM d")}, you&apos;ll have</> : "Projected end of this week"}
            </h2>
            <div
              className={clsx(
                "font-wide mt-2 text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.03em]",
                weekNegative ? "text-rose-700" : "text-slate-900",
              )}
              data-testid="summary-value-end-of-this-week"
            >
              {week ? <Balance cents={week.closingBalanceCents} currency={currency} iconClassName="h-[0.7em] w-[0.7em]" /> : "—"}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {week
                ? `Closing balance for ${fmtRange(week.rangeStart, week.rangeEnd)}, after every bill due this week.`
                : "Today is outside the forecast window."}
            </p>
          </div>

          <div className="grid gap-x-6 gap-y-5 pt-10 sm:grid-cols-3">
            <Figure
              id="end-of-next-week"
              label="End of next week"
              sub={d.nextWeek ? fmtRange(d.nextWeek.rangeStart, d.nextWeek.rangeEnd) : "Beyond the forecast window."}
            >
              {d.nextWeek ? <Balance cents={d.nextWeek.closingBalanceCents} currency={currency} iconClassName="h-4 w-4" /> : "—"}
            </Figure>
            <Figure id="lowest-balance" label="Lowest point" sub={`End of ${fmtDayShort(t.lowestBalanceDate)}`}>
              <Balance cents={t.lowestBalanceCents} currency={currency} iconClassName="h-4 w-4" />
            </Figure>
            <Figure
              id="next-paycheck"
              label="Next paycheck"
              sub={d.nextPaycheck ? `${d.nextPaycheck.name}, ${fmtDayShort(d.nextPaycheck.date)}` : "No upcoming income in the forecast."}
            >
              {d.nextPaycheck ? (
                <span className="tabular-nums text-emerald-700">+{money(d.nextPaycheck.amountCents, currency)}</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </Figure>
          </div>
        </section>

        {/* The forecast as a sum, the way a register reconciles. */}
        <Card className="px-5 pt-4 pb-2" aria-labelledby="sum-heading">
          <h2 id="sum-heading" className="font-semiwide text-base font-bold text-slate-900">
            How the forecast adds up
          </h2>
          <p className="mt-0.5 mb-2 text-sm text-slate-600">{fmtRange(d.window.startDate, d.window.endDate)}</p>
          <RegisterLine
            id="starting-balance"
            op=""
            label="Starting balance"
            sub={
              <>
                Entered by you, as of {fmtShort(d.settings.projectionStartDate)}.{" "}
                <Link href="/settings" className="font-semibold text-brand-700 underline">Update</Link>
              </>
            }
          >
            <Balance cents={d.settings.startingBalanceCents} currency={currency} iconClassName="h-4 w-4" />
          </RegisterLine>
          <RegisterLine id="total-income" op="+" label="Income" sub="Every paycheck in the forecast">
            <span className="text-emerald-700">+{money(t.incomeCents, currency)}</span>
          </RegisterLine>
          <RegisterLine id="total-bills" op="−" label="Bills" sub="Every bill not skipped">
            <span className="text-rose-700">{"−"}{money(t.billsCents, currency)}</span>
          </RegisterLine>
          <RegisterLine id="ending-balance" op="=" label="Projected at forecast end" sub={`End of ${fmtShort(d.window.endDate)}`} total>
            <Balance cents={t.endingBalanceCents} currency={currency} iconClassName="h-4 w-4" />
          </RegisterLine>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <Card>
          <CardHeader title="Projected balance" description={`End-of-day balance, ${fmtRange(d.window.startDate, d.window.endDate)}`} />
          <CardBody>
            <TrendChart dashboard={d} />
          </CardBody>
        </Card>

        <Card data-testid="upcoming-bills">
          <CardHeader
            title="Upcoming bills"
            description="Next 14 days, with your balance after each"
            action={
              <Link href="/bills" className="text-sm font-semibold text-brand-700 hover:underline">
                All bills
              </Link>
            }
          />
          <CardBody className="pt-3">
            {d.upcomingBills.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-600">No bills due in the next two weeks.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {d.upcomingBills.map((b) => (
                  <li key={b.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5" data-testid={`upcoming-bill-${b.id}`}>
                    <span className="flex flex-col items-center rounded-chip border border-slate-200 bg-slate-50 py-0.5 leading-none" aria-hidden="true">
                      <span className="text-[11px] text-slate-500">{fmtDate(b.date, "MMM")}</span>
                      <span className="font-semiwide text-base font-bold text-slate-900">{fmtDate(b.date, "d")}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-600">
                        {fmtDate(b.date, "EEEE")}
                        {b.status === "PAID" && <Badge tone="positive">Paid</Badge>}
                        {b.amountOverridden && <Badge tone="info">Adjusted</Badge>}
                      </p>
                    </div>
                    <div className="text-right">
                      <EventAmount kind="BILL" amountCents={b.amountCents} currency={currency} className="text-sm" />
                      <p className="text-xs text-slate-500">
                        <span className="sr-only">Balance after: </span>
                        <Balance cents={b.balanceAfterCents} currency={currency} iconClassName="h-3 w-3" />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
