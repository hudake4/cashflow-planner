"use client";

import { ArrowDown, ArrowUp, ChartPie, Equal, Landmark, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { SpendingResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PeriodPanel } from "./period-panel";

const linkButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-600 px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

const textLink =
  "inline-flex min-h-11 items-center rounded-control font-semibold text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SpendingView() {
  const spending = useApi<SpendingResponse>("spending", api.getSpending);

  return (
    <>
      <PageHeader
        title="Spend Analyzer"
        description="Where your money went last month and so far this month, from your connected banks."
      />
      {spending.error && !spending.data ? (
        <ErrorState message={spending.error} onRetry={spending.reload} title="Couldn't load your spending" />
      ) : spending.data ? (
        <div aria-busy={spending.refreshing || undefined}>
          <SpendingContent s={spending.data} />
        </div>
      ) : (
        <SpendingSkeleton />
      )}
    </>
  );
}

function SpendingSkeleton() {
  return (
    <LoadingRegion label="Loading spending">
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardBody className="space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-48" />
              {[0, 1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** This month against the same stretch of last month. Direction is in words and an icon, not color. */
function Comparison({ thisMonthCents, lastToDateCents, currency }: { thisMonthCents: number; lastToDateCents: number; currency: string }) {
  const diff = thisMonthCents - lastToDateCents;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Equal;
  const direction = diff > 0 ? `Up ${money(diff, currency)}` : diff < 0 ? `Down ${money(-diff, currency)}` : "No change";
  return (
    <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground" data-testid="spending-compare">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold text-foreground">{direction}</span> vs {money(lastToDateCents, currency)} spent by this day last
        month
      </span>
    </p>
  );
}

function SpendingContent({ s }: { s: SpendingResponse }) {
  if (s.connectionCount === 0) {
    return (
      <EmptyState
        icon={<Landmark className="h-6 w-6" />}
        title="Connect a bank to see your spending"
        description="The Spend Analyzer sorts the transactions from your connected banks into categories. Everything stays on this computer."
        testId="spending-empty-no-bank"
        action={
          <Link href="/institutions" className={linkButton}>
            Go to Institutions
          </Link>
        }
      />
    );
  }

  if (s.thisMonth.totalCents === 0 && s.lastMonth.totalCents === 0) {
    return (
      <EmptyState
        icon={<ChartPie className="h-6 w-6" />}
        title="No spending to show yet"
        description="Your connected banks have no money-out transactions for last month or this month. Transfers and card payments aren't counted as spending. Refresh your bank to pull in the newest activity."
        testId="spending-empty-no-spend"
        action={
          <Link href="/institutions" className={linkButton}>
            Go to Institutions
          </Link>
        }
      />
    );
  }

  const incomplete = s.coverageStart !== null && s.coverageStart > s.lastMonth.from;

  return (
    <div className="space-y-6" data-testid="spending-view">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PeriodPanel
          id="this-month"
          title="This month"
          period={s.thisMonth}
          currency={s.currency}
          comparison={<Comparison thisMonthCents={s.thisMonth.totalCents} lastToDateCents={s.lastMonthToDateCents} currency={s.currency} />}
        />
        <PeriodPanel id="last-month" title="Last month" period={s.lastMonth} currency={s.currency} />
      </div>

      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        {incomplete && s.coverageStart && (
          <p className="flex items-start gap-2 text-sm text-foreground" data-testid="spending-coverage-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Your bank history starts on {fmtShort(s.coverageStart)}, so last month&apos;s figures may be incomplete.
          </p>
        )}
        <p data-testid="spending-coverage">
          {s.coverageStart ? `Based on transactions from ${fmtShort(s.coverageStart)} to today` : "Based on your stored transactions"} (the app
          keeps the last 89 days)
          {s.lastSyncedAt && ` · last updated ${fmtShort(s.lastSyncedAt.slice(0, 10))}`}
        </p>
        <Link href="/institutions" className={textLink}>
          Refresh your bank on Institutions
        </Link>
      </div>
    </div>
  );
}
