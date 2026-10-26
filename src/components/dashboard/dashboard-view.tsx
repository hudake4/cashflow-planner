"use client";

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { CalendarDays, HandCoins, Info, Receipt, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BillDTO, DashboardResponse, IncomeDTO, ScenarioInput } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtDate, fmtDayShort, fmtRange, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { RecurringScanButton } from "@/components/recurring/recurring-scan";
import { StaleAccountsNote } from "@/components/stale-accounts-note";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AnimatedBalance, Balance, EventAmount } from "@/components/ui/money";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TrendChart } from "./trend-chart";
import { ScenarioDialog } from "@/components/scenario/scenario-dialog";

const DISCLAIMER = "Projected balance assumes all scheduled income arrives and all listed bills are paid on time.";

export function DashboardView() {
  const dash = useApi<DashboardResponse>("dashboard", api.getDashboard);
  const [scenario, setScenario] = useState<ScenarioInput | null>(null);
  const scenarioState = useApi<DashboardResponse>(
    scenario ? `dashboard:scenario:${JSON.stringify(scenario)}` : null,
    () => api.getScenarioDashboard(scenario!),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bills, setBills] = useState<BillDTO[]>([]);
  const [incomes, setIncomes] = useState<IncomeDTO[]>([]);

  useEffect(() => {
    if (!dialogOpen) return;
    void api.listBills().then(setBills).catch(() => setBills([]));
    void api.listIncome().then(setIncomes).catch(() => setIncomes([]));
  }, [dialogOpen]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How much you'll have left each week after income and upcoming bills."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <RecurringScanButton onAdded={() => void dash.reload()} className="flex-1 sm:flex-none" />
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="min-h-11 flex-1 sm:flex-none"
              data-testid="what-if-button"
            >
              What-if
            </Button>
            {scenario && (
              <Badge tone="info" data-testid="scenario-active">Scenario active</Badge>
            )}
            {scenario && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScenario(null)}
                className="min-h-11 flex-1 sm:flex-none"
                data-testid="scenario-clear"
              >
                Clear scenario
              </Button>
            )}
            <Button
              size="sm"
              loading={dash.refreshing}
              onClick={() => void dash.reload()}
              className="min-h-11 flex-1 sm:flex-none"
              data-testid="dashboard-refresh"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
            <Button
              asChild
              variant={dash.data && !dash.data.hasData ? "outline" : "default"}
              size="lg"
              className="min-h-11 flex-1 rounded-control font-semibold sm:flex-none"
              data-testid="dashboard-open-calendar"
            >
              <Link href="/calendar">
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> Open calendar
              </Link>
            </Button>
          </div>
        }
      />
      {dash.error && (
        <ErrorState
          message={dash.error}
          onRetry={dash.reload}
          title={dash.data ? "Dashboard refresh failed" : "Couldn't load the dashboard"}
          className="mb-6"
        />
      )}
      {dash.data ? (
        <div aria-busy={dash.refreshing || undefined}>
          <DashboardContent d={dash.data} scenarioDashboard={scenarioState.data ?? null} />
        </div>
      ) : dash.error ? null : (
        <DashboardSkeleton />
      )}
      <ScenarioDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onApply={(s) => setScenario(s)} bills={bills} incomes={incomes} />
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-16 w-80 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <div className="grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex justify-between gap-3 py-3 sm:min-h-24 sm:flex-col sm:justify-between sm:px-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-28 self-end" />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
        <Card><CardBody className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</CardBody></Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        {[0, 1].map((i) => <Card key={i}><CardBody><Skeleton className="h-64 w-full" /></CardBody></Card>)}
      </div>
    </LoadingRegion>
  );
}

/** One compact ledger figure under the current-week balance. */
function SummaryMetric({ id, label, children, sub }: { id: string; label: string; children: ReactNode; sub: ReactNode }) {
  return (
    <div data-testid={`summary-card-${id}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-x-3 py-3 sm:min-h-24 sm:grid-cols-1 sm:grid-rows-[auto_auto_1fr] sm:px-3">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</dd>
      <dd className="col-start-2 row-span-2 row-start-1 self-center whitespace-nowrap font-semiwide text-right text-base font-bold tabular-nums text-foreground sm:col-start-1 sm:row-span-1 sm:row-start-3 sm:self-end" data-testid={`summary-value-${id}`}>
        {children}
      </dd>
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

function DashboardContent({ d, scenarioDashboard }: { d: DashboardResponse; scenarioDashboard?: DashboardResponse | null }) {
  const currency = d.settings.currency;
  const t = d.totals;
  const fromAccounts = d.settings.startingBalanceSource === "ACCOUNTS" && d.settings.accountsBalanceCents !== null;

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
              <Button asChild variant="default" size="lg" className="min-h-11 rounded-control font-semibold">
                <Link href="/income">
                  <HandCoins className="h-4 w-4" aria-hidden="true" /> Add your first paycheck
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-11 rounded-control font-semibold">
                <Link href="/bills">
                  <Receipt className="h-4 w-4" aria-hidden="true" /> Add a bill
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="min-h-11 rounded-control font-semibold">
                <Link href="/settings">Set starting balance or load demo data</Link>
              </Button>
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
        <Alert variant="destructive" role="alert" className="flex items-start gap-3 border-rose-200 bg-rose-50 p-4 text-rose-900" data-testid="negative-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div>
            <AlertTitle className="font-bold">Your balance is projected to go negative on {fmtDayShort(t.firstNegativeDate)}.</AlertTitle>
            <AlertDescription className="mt-0.5 text-sm text-rose-900">
              Lowest point: {money(t.lowestBalanceCents, currency)} on {fmtShort(t.lowestBalanceDate)}
              {t.negativeDayCount > 0 && `, with ${t.negativeDayCount} day${t.negativeDayCount === 1 ? "" : "s"} below zero in the forecast`}.{" "}
              <Link href="/calendar" className="font-semibold underline">
                Review in calendar
              </Link>
            </AlertDescription>
          </div>
        </Alert>
      )}

      <Card data-testid="safe-to-spend" className="min-w-0">
        <CardBody className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">Safe to spend today</h2>
          <div
            className="font-semiwide mt-3 min-w-0 text-4xl leading-tight font-bold tracking-tight tabular-nums sm:text-[2.5rem]"
            data-testid="safe-to-spend-value"
          >
            <Balance cents={d.safeToSpendCents} currency={currency} iconClassName="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            You can spend this today without your projected balance dropping below{" "}
            {money(d.settings.balanceFloorCents, currency)}.
          </p>
        </CardBody>
      </Card>

      <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        {/* Hero: the one number the app exists to answer. */}
        <section aria-labelledby="this-week-heading" className="flex min-w-0 flex-col">
          <Card data-testid="summary-card-end-of-this-week" className="min-w-0">
            <CardBody className="p-5 sm:p-6">
              <h2 id="this-week-heading" className="text-lg font-semibold text-foreground">
                {week ? <>By {fmtDate(week.rangeEnd, "EEEE, MMM d")}, you&apos;ll have</> : "Projected end of this week"}
              </h2>
              <div
                className={clsx(
                  "font-semiwide mt-3 min-w-0 text-4xl leading-tight font-bold tracking-tight tabular-nums sm:text-[2.5rem]",
                  weekNegative ? "text-rose-700" : "text-foreground",
                )}
                data-testid="summary-value-end-of-this-week"
              >
                {week ? <AnimatedBalance cents={week.closingBalanceCents} currency={currency} className="font-semiwide font-bold" iconClassName="h-7 w-7 sm:h-8 sm:w-8" /> : "—"}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {week
                  ? `Closing balance for ${fmtRange(week.rangeStart, week.rangeEnd)}, after every bill due this week.`
                  : "Today is outside the forecast window."}
              </p>
              <dl className="mt-5 grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <SummaryMetric
                  id="end-of-next-week"
                  label="End of next week"
                  sub={d.nextWeek ? fmtRange(d.nextWeek.rangeStart, d.nextWeek.rangeEnd) : "Beyond the forecast window."}
                >
                  {d.nextWeek ? <Balance cents={d.nextWeek.closingBalanceCents} currency={currency} iconClassName="h-4 w-4" /> : "—"}
                </SummaryMetric>
                <SummaryMetric id="lowest-balance" label="Lowest point" sub={`End of ${fmtDayShort(t.lowestBalanceDate)}`}>
                  <Balance cents={t.lowestBalanceCents} currency={currency} iconClassName="h-4 w-4" />
                </SummaryMetric>
                <SummaryMetric
                  id="next-paycheck"
                  label="Next paycheck"
                  sub={d.nextPaycheck ? `${d.nextPaycheck.name}, ${fmtDayShort(d.nextPaycheck.date)}` : "No upcoming income in the forecast."}
                >
                  {d.nextPaycheck ? (
                    <span className="tabular-nums text-emerald-700">+{money(d.nextPaycheck.amountCents, currency)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </SummaryMetric>
              </dl>
            </CardBody>
          </Card>
        </section>

        {/* The forecast as a sum, the way a register reconciles. */}
        <Card aria-labelledby="sum-heading">
          <CardBody className="px-5 pt-5 pb-2">
          <h2 id="sum-heading" className="font-semiwide text-base font-bold text-foreground">
            How the forecast adds up
          </h2>
          <p className="mt-0.5 mb-2 text-sm text-muted-foreground">{fmtRange(d.window.startDate, d.window.endDate)}</p>
          <RegisterLine
            id="starting-balance"
            op=""
            label="Starting balance"
            sub={
              <>
                {`${fromAccounts ? "Total of your bank accounts" : "Entered by you"}, as of ${fmtShort(d.settings.projectionStartDate)}.`}{" "}
                {/* The bank total can't be edited in Settings; it changes when the accounts refresh. */}
                <Link href={fromAccounts ? "/institutions" : "/settings"} className="font-semibold text-brand-700 underline">
                  {fromAccounts ? "Refresh" : "Update"}
                </Link>
                {fromAccounts && d.settings.accountsStaleCount > 0 && (
                  <StaleAccountsNote count={d.settings.accountsStaleCount} className="mt-1 block text-foreground" />
                )}
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
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <Card>
          <CardHeader title="Projected balance" description={`End-of-day balance, ${fmtRange(d.window.startDate, d.window.endDate)}`} />
          <CardBody>
            <TrendChart dashboard={d} scenarioDashboard={scenarioDashboard} />
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
              <p role="status" className="py-6 text-center text-sm text-muted-foreground">No bills due in the next two weeks.</p>
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
