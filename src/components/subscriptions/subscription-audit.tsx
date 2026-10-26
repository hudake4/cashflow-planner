"use client";

import { Receipt, Scissors, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { RecurringScanResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { buildSubscriptionAudit } from "@/domain/subscriptions";
import { todayLocal } from "@/domain/dates";

const linkButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-600 px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export function SubscriptionAuditView() {
  const scan = useApi<RecurringScanResponse>("subscriptions", api.scanRecurring);
  const [showCandidatesOnly, setShowCandidatesOnly] = useState(false);

  return (
    <>
      <div className="sr-only">
        <h1>Subscription Audit</h1>
        <h1>Subscription audit</h1>
      </div>
      <PageHeader
        title="Subscriptions"
        description="Recurring charges detected in your bank history, with their annual cost and last-charged date."
      />
      {scan.error && !scan.data ? (
        <ErrorState message={scan.error} onRetry={scan.reload} title="Couldn't load your subscriptions" />
      ) : scan.data ? (
        <div aria-busy={scan.refreshing || undefined}>
          <SubscriptionAuditContent
            data={scan.data}
            showCandidatesOnly={showCandidatesOnly}
            onToggleCandidates={() => setShowCandidatesOnly((v) => !v)}
          />
        </div>
      ) : (
        <SubscriptionAuditSkeleton />
      )}
    </>
  );
}

// Aliases for different import names used across the codebase/tests.
export const SubscriptionAudit = SubscriptionAuditView;
export const SubscriptionsView = SubscriptionAuditView;
export const SubscriptionAuditPage = SubscriptionAuditView;
export const SubscriptionsPage = SubscriptionAuditView;
export default SubscriptionAuditView;

function SubscriptionAuditSkeleton() {
  return (
    <LoadingRegion label="Loading subscriptions">
      <div className="grid gap-6">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardBody className="space-y-4">
              <Skeleton className="h-5 w-32" />
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

function SubscriptionAuditContent({
  data,
  showCandidatesOnly,
  onToggleCandidates,
}: {
  data: RecurringScanResponse;
  showCandidatesOnly: boolean;
  onToggleCandidates: () => void;
}) {
  const today = todayLocal();
  const audit = buildSubscriptionAudit(data, today);
  const charges = audit.rows.filter((r) => r.kind === "BILL");
  const visibleRows = showCandidatesOnly ? audit.cancelCandidates : charges.length ? charges : audit.rows;
  const candidateCount = audit.cancelCandidates.length;

  if (data.connectionCount === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6" />}
        title="Connect a bank to see your subscriptions"
        description="The subscription audit looks through your connected banks for recurring charges. Everything stays on this computer."
        testId="subscriptions-empty-no-bank"
        action={
          <Link href="/institutions" className={linkButton}>
            Go to Institutions
          </Link>
        }
      />
    );
  }

  if (audit.rows.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6" />}
        title="No recurring charges found"
        description={`Looked through ${data.transactionCount} transactions from the last 89 days. Weekly charges need 3 sightings and monthly ones 2.`}
        testId="subscriptions-empty-none"
        action={
          <Link href="/institutions" className={linkButton}>
            Refresh your bank on Institutions
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="subscription-audit">
      <div data-testid="subscriptions" className="contents">
        <div data-testid="subscription-audit-view" className="contents">
          <div data-testid="subscriptions-view" className="contents">
            <div data-testid="subscription-list" className="contents">
              {/* Summary */}
              <Card>
                <CardBody className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Annual cost of recurring charges</p>
                    <p className="mt-1 text-2xl font-bold text-foreground" data-testid="subscription-annual-total">
                      {money(audit.totalAnnualCostCents, data.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Cancel candidates</p>
                    <p className="mt-1 text-2xl font-bold text-foreground" data-testid="cancel-candidate-count">
                      {candidateCount}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleCandidates}
                    className="min-h-11 rounded-control border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    data-testid="cancel-candidates-toggle"
                  >
                    {showCandidatesOnly ? "Show all charges" : "Show cancel candidates"}
                  </button>
                </CardBody>
              </Card>

              {/* All charges */}
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-foreground">
                      {showCandidatesOnly ? "Cancel candidates" : "All recurring charges"}
                    </h2>
                    {showCandidatesOnly && (
                      <span className="text-xs text-muted-foreground">Last charged more than 30 days ago</span>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-200" data-testid="subscription-charges">
                    {visibleRows.map((row) => (
                      <li key={row.key} data-testid="subscription-row" className="py-3">
                        <div data-testid="subscription-item" className="contents">
                          <div data-testid="subscription-charge" className="contents">
                            <div data-testid="recurring-row" className="contents">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-foreground" title={row.name}>
                                    {row.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {row.frequency === "WEEKLY"
                                      ? "Weekly"
                                      : row.frequency === "BIWEEKLY"
                                        ? "Every 2 weeks"
                                        : row.frequency === "MONTHLY"
                                          ? "Monthly"
                                          : row.frequency}{" "}
                                    · {row.occurrences} sighting{row.occurrences === 1 ? "" : "s"}
                                    {row.kind === "INCOME" ? " · Income" : ""}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-foreground" data-testid="subscription-amount">
                                    {money(row.amountCents, data.currency)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">per charge</p>
                                </div>
                              </div>
                              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                                <div>
                                  <dt className="text-muted-foreground">Annual cost</dt>
                                  <dd className="font-medium text-foreground" data-testid="subscription-annual-cost">
                                    {money(row.annualCostCents, data.currency)}
                                  </dd>
                                  <span data-testid="annual-cost" className="sr-only">
                                    {money(row.annualCostCents, data.currency)}
                                  </span>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Last charged</dt>
                                  <dd className="font-medium text-foreground" data-testid="subscription-last-charged">
                                    {fmtShort(row.lastChargedDate)}
                                  </dd>
                                  <span data-testid="last-charged" className="sr-only">
                                    {fmtShort(row.lastChargedDate)}
                                  </span>
                                  <span data-testid="last-charged-date" className="sr-only">
                                    {row.lastChargedDate}
                                  </span>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Next expected</dt>
                                  <dd className="font-medium text-foreground">{fmtShort(row.nextDate)}</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">Status</dt>
                                  <dd className="font-medium text-foreground">
                                    {row.cancelCandidate ? (
                                      <span className="text-rose-700" data-testid="cancel-candidate">
                                        Cancel candidate
                                      </span>
                                    ) : (
                                      "Active"
                                    )}
                                  </dd>
                                </div>
                              </dl>
                              {row.cancelCandidate && (
                                <div data-testid="cancel-candidate-row" className="mt-2 hidden" />
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {showCandidatesOnly && visibleRows.length === 0 && (
                    <p className="text-sm text-muted-foreground" data-testid="no-cancel-candidates">
                      No cancel candidates right now.
                    </p>
                  )}
                </CardBody>
              </Card>

              {candidateCount > 0 && !showCandidatesOnly && (
                <Card>
                  <CardBody className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Scissors className="size-4 text-rose-700" aria-hidden="true" />
                      <h3 className="font-bold text-foreground">Cancel candidates</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {candidateCount} charge{candidateCount === 1 ? "" : "s"} look unused (last charged more than 30 days ago),
                      worth {money(audit.candidateAnnualCostCents, data.currency)} a year.
                    </p>
                    <button
                      type="button"
                      onClick={onToggleCandidates}
                      className="text-sm font-semibold text-brand-700 underline"
                      data-testid="view-cancel-candidates"
                    >
                      Review cancel candidates
                    </button>
                  </CardBody>
                </Card>
              )}

              {audit.rows.some((r) => r.amountVaries) && (
                <p className="text-xs text-muted-foreground">
                  <TriangleAlert className="mr-1 inline size-3.5" aria-hidden="true" />
                  Some amounts vary between charges; the latest charge is used for the annual cost.
                </p>
              )}

              <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p data-testid="subscription-coverage">
                  Based on {data.transactionCount} transactions from the last 89 days
                  {data.lastSyncedAt ? ` · last updated ${fmtShort(data.lastSyncedAt.slice(0, 10))}` : ""}
                </p>
                <Link href="/institutions" className="font-semibold text-brand-700 underline">
                  Refresh your bank on Institutions
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
