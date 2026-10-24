"use client";

import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarRange,
  HandCoins,
  Info,
  PiggyBank,
  Receipt,
  TrendingDown,
  TriangleAlert,
  Wallet,
} from "lucide-react";
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
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

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
      <p className="mt-8 flex items-start gap-2 text-xs text-slate-600" data-testid="disclaimer">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {DISCLAIMER} Figures are projections from what you entered, not a live bank balance.
      </p>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <Skeleton className="h-64 w-full" />
      </Card>
    </LoadingRegion>
  );
}

function SummaryCard({
  id,
  label,
  icon,
  children,
  sub,
  tone = "default",
  kind = "projection",
}: {
  id: string;
  label: string;
  icon: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "negative";
  kind?: "projection" | "entered";
}) {
  return (
    <Card
      data-testid={`summary-card-${id}`}
      className={clsx("flex flex-col gap-2 p-5", tone === "negative" && "border-rose-300 bg-rose-50/50", kind === "entered" && "bg-slate-50")}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-600">{label}</h2>
        <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", tone === "negative" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-900" data-testid={`summary-value-${id}`}>
        {children}
      </div>
      {sub && <div className="text-xs text-slate-600">{sub}</div>}
    </Card>
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
              <Link href="/bills" className={clsx(linkButton, "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50")}>
                <Receipt className="h-4 w-4" aria-hidden="true" /> Add a bill
              </Link>
              <Link href="/settings" className={clsx(linkButton, "text-slate-700 shadow-none hover:bg-slate-100")}>
                Set starting balance or load demo data
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {t.firstNegativeDate && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4" data-testid="negative-warning">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div className="text-sm text-rose-900">
            <p className="font-semibold">Your balance is projected to go negative on {fmtDayShort(t.firstNegativeDate)}.</p>
            <p className="mt-0.5">
              Lowest point: {money(t.lowestBalanceCents, currency)} on {fmtShort(t.lowestBalanceDate)}
              {t.negativeDayCount > 0 && ` · ${t.negativeDayCount} day${t.negativeDayCount === 1 ? "" : "s"} below zero in the forecast`}.{" "}
              <Link href="/calendar" className="font-medium underline">
                Review in calendar
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          id="starting-balance"
          label="Starting balance"
          icon={<PiggyBank className="h-4 w-4" />}
          kind="entered"
          sub={
            <>
              <Badge tone="neutral" className="mr-1">Entered by you</Badge>
              as of {fmtShort(d.settings.projectionStartDate)}, before that day&apos;s events.{" "}
              <Link href="/settings" className="font-medium text-brand-700 underline">Update</Link>
            </>
          }
        >
          <Balance cents={d.settings.startingBalanceCents} currency={currency} iconClassName="h-5 w-5" />
        </SummaryCard>

        <SummaryCard
          id="next-paycheck"
          label="Next paycheck"
          icon={<HandCoins className="h-4 w-4" />}
          sub={d.nextPaycheck ? `${d.nextPaycheck.name} · ${fmtDayShort(d.nextPaycheck.date)}` : "No upcoming income in the forecast."}
        >
          {d.nextPaycheck ? (
            <span className="tabular-nums text-emerald-700">{money(d.nextPaycheck.amountCents, currency)}</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </SummaryCard>

        <SummaryCard
          id="end-of-this-week"
          label="Projected end of this week"
          icon={<CalendarDays className="h-4 w-4" />}
          tone={d.currentWeek && d.currentWeek.closingBalanceCents < 0 ? "negative" : "default"}
          sub={d.currentWeek ? `Closing balance ${fmtRange(d.currentWeek.rangeStart, d.currentWeek.rangeEnd)}` : "Outside the forecast window."}
        >
          {d.currentWeek ? <Balance cents={d.currentWeek.closingBalanceCents} currency={currency} iconClassName="h-5 w-5" /> : "—"}
        </SummaryCard>

        <SummaryCard
          id="end-of-next-week"
          label="Projected end of next week"
          icon={<CalendarRange className="h-4 w-4" />}
          tone={d.nextWeek && d.nextWeek.closingBalanceCents < 0 ? "negative" : "default"}
          sub={d.nextWeek ? `Closing balance ${fmtRange(d.nextWeek.rangeStart, d.nextWeek.rangeEnd)}` : "Beyond the forecast window."}
        >
          {d.nextWeek ? <Balance cents={d.nextWeek.closingBalanceCents} currency={currency} iconClassName="h-5 w-5" /> : "—"}
        </SummaryCard>

        <SummaryCard
          id="lowest-balance"
          label="Lowest projected balance"
          icon={<TrendingDown className="h-4 w-4" />}
          tone={t.lowestBalanceCents < 0 ? "negative" : "default"}
          sub={`On ${fmtDayShort(t.lowestBalanceDate)} (end of day)`}
        >
          <Balance cents={t.lowestBalanceCents} currency={currency} iconClassName="h-5 w-5" />
        </SummaryCard>

        <SummaryCard
          id="total-income"
          label="Total income"
          icon={<ArrowUp className="h-4 w-4" />}
          sub={`Over the forecast, ${fmtRange(d.window.startDate, d.window.endDate)}`}
        >
          <span className="tabular-nums text-emerald-700">+{money(t.incomeCents, currency)}</span>
        </SummaryCard>

        <SummaryCard
          id="total-bills"
          label="Total bills"
          icon={<ArrowDown className="h-4 w-4" />}
          sub={`Over the forecast, ${fmtRange(d.window.startDate, d.window.endDate)}`}
        >
          <span className="tabular-nums text-rose-700">{"−"}{money(t.billsCents, currency)}</span>
        </SummaryCard>

        <SummaryCard
          id="ending-balance"
          label="Projected at forecast end"
          icon={<Wallet className="h-4 w-4" />}
          tone={t.endingBalanceCents < 0 ? "negative" : "default"}
          sub={`End of ${fmtShort(d.window.endDate)}`}
        >
          <Balance cents={t.endingBalanceCents} currency={currency} iconClassName="h-5 w-5" />
        </SummaryCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader title="Projected balance" description={`End-of-day balance, ${fmtRange(d.window.startDate, d.window.endDate)}`} />
          <CardBody>
            <TrendChart dashboard={d} />
          </CardBody>
        </Card>

        <Card data-testid="upcoming-bills">
          <CardHeader
            title="Upcoming bills"
            description="Next 14 days"
            action={
              <Link href="/bills" className="text-sm font-medium text-brand-700 hover:underline">
                All bills
              </Link>
            }
          />
          <CardBody className="pt-3">
            {d.upcomingBills.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-600">No bills due in the next two weeks.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.upcomingBills.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`upcoming-bill-${b.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-600">
                        {fmtDate(b.date, "EEE, MMM d")}
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
