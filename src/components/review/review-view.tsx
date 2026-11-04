"use client";

import { Landmark, TriangleAlert, Waypoints } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ReviewResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ComparisonPanel } from "./comparison-panel";

const linkButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-600 px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

const textLink =
  "inline-flex min-h-11 items-center rounded-control font-semibold text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const MODE_ITEM_CLASS = "h-11 min-w-20 rounded-chip px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

type Mode = "week" | "month";

export function ReviewView() {
  const review = useApi<ReviewResponse>("review", api.getReview);

  return (
    <>
      <PageHeader
        title="Recap"
        description="Income, tracked bills paid and spending for this week and this month, each next to the one before."
      />
      {review.error && !review.data ? (
        <ErrorState message={review.error} onRetry={review.reload} title="Couldn't load your recap" />
      ) : review.data ? (
        <div aria-busy={review.refreshing || undefined}>
          <ReviewContent r={review.data} />
        </div>
      ) : (
        <ReviewSkeleton />
      )}
    </>
  );
}

function ReviewSkeleton() {
  return (
    <LoadingRegion label="Loading recap">
      <Card>
        <CardBody className="space-y-4">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardBody>
      </Card>
    </LoadingRegion>
  );
}

function ReviewContent({ r }: { r: ReviewResponse }) {
  const [mode, setMode] = useState<Mode>("month");

  if (r.connectionCount === 0) {
    return (
      <EmptyState
        icon={<Landmark className="h-6 w-6" />}
        title="Connect a bank to see your recap"
        description="The recap compares the income and spending in your connected banks with the previous week and month. Everything stays on this computer."
        testId="review-empty-no-bank"
        action={
          <Link href="/institutions" className={linkButton}>
            Go to Institutions
          </Link>
        }
      />
    );
  }

  const comparison = r[mode];
  const incomplete = r.coverageStart !== null && r.coverageStart > comparison.previous.from;
  const noun = mode === "week" ? "week" : "month";

  return (
    <div className="space-y-6" data-testid="review-view">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value === "week" || value === "month") setMode(value);
        }}
        aria-label="Recap period"
        variant="outline"
        spacing={0}
        className="w-fit rounded-control border border-border bg-card p-0.5"
      >
        <ToggleGroupItem value="week" aria-label="Week recap" data-testid="review-mode-week" className={MODE_ITEM_CLASS}>
          Week
        </ToggleGroupItem>
        <ToggleGroupItem value="month" aria-label="Month recap" data-testid="review-mode-month" className={MODE_ITEM_CLASS}>
          Month
        </ToggleGroupItem>
      </ToggleGroup>

      <ComparisonPanel key={mode} noun={noun} comparison={comparison} currency={r.currency} />

      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        {incomplete && r.coverageStart && (
          <p className="flex items-start gap-2 text-sm text-foreground" data-testid="review-coverage-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Your bank history starts on {fmtShort(r.coverageStart)}, so last {noun}&apos;s figures may be incomplete.
          </p>
        )}
        <p className="flex items-start gap-2" data-testid="review-notes">
          <Waypoints className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Income is money in to your bank accounts, without transfers between your accounts and refunds. Bills paid are the bills you marked
          paid, by due date. Spending is the same total as the Spend Analyzer; paying a bill is already in it.
        </p>
        <p data-testid="review-coverage">
          {r.coverageStart ? `Based on transactions from ${fmtShort(r.coverageStart)} to today` : "Based on your stored transactions"}
          {r.lastSyncedAt && ` · last updated ${fmtShort(r.lastSyncedAt.slice(0, 10))}`}
        </p>
        <Link href="/institutions" className={textLink}>
          Refresh your bank on Institutions
        </Link>
      </div>
    </div>
  );
}
