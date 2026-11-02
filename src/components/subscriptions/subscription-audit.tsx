"use client";

import { Receipt, Scissors, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HISTORY_DAYS, type SubscriptionAuditResponse } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort, localDateOf } from "@/lib/dates";
import { FREQUENCY_LABELS, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { buildSubscriptionAudit } from "@/domain/subscriptions";
import { todayLocal } from "@/domain/dates";

const frequencyLabel = (frequency: string) => FREQUENCY_LABELS[frequency as keyof typeof FREQUENCY_LABELS] ?? frequency;

export function SubscriptionAuditView() {
  const scan = useApi<SubscriptionAuditResponse>("subscriptions", api.getSubscriptions);
  const [showCandidatesOnly, setShowCandidatesOnly] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const toast = useToast();

  const data = scan.data;
  const audit = useMemo(() => {
    if (!data) return null;
    return buildSubscriptionAudit({
      suggestions: data.suggestions.filter((s) => !dismissed.has(s.key)),
      tracked: data.tracked,
      today: todayLocal(),
      currency: data.currency,
    });
  }, [data, dismissed]);

  async function dismiss(key: string, name: string) {
    setDismissed((prev) => new Set(prev).add(key));
    try {
      await api.dismissSubscription(key);
      toast(`“${name}” is no longer listed as a subscription.`, "success");
    } catch (err) {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Recurring charges in your bank history and the subscriptions you already track, with their annual cost."
      />
      {scan.error && !data ? (
        <ErrorState message={scan.error} onRetry={scan.reload} title="Couldn't load your subscriptions" />
      ) : !data || !audit ? (
        <SubscriptionAuditSkeleton />
      ) : data.connectionCount === 0 && audit.rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="Connect a bank to see your subscriptions"
          description="The subscription audit looks through your connected banks for recurring charges. Everything stays on this computer."
          testId="subscriptions-empty-no-bank"
          action={
            <Button asChild variant="primary">
              <Link href="/institutions">Go to Institutions</Link>
            </Button>
          }
        />
      ) : audit.rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No subscriptions found"
          description={`Looked through ${data.transactionCount} transactions from the last ${HISTORY_DAYS} days. Weekly and biweekly charges need 3 sightings and monthly ones 2.`}
          testId="subscriptions-empty-none"
          action={
            <Button asChild variant="primary">
              <Link href="/institutions">Refresh your bank on Institutions</Link>
            </Button>
          }
        />
      ) : (
        <div aria-busy={scan.refreshing || undefined}>
          <SubscriptionAuditContent
            audit={audit}
            data={data}
            showCandidatesOnly={showCandidatesOnly}
            onToggleCandidates={() => setShowCandidatesOnly((v) => !v)}
            onDismiss={dismiss}
          />
        </div>
      )}
    </>
  );
}

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
  audit,
  data,
  showCandidatesOnly,
  onToggleCandidates,
  onDismiss,
}: {
  audit: ReturnType<typeof buildSubscriptionAudit>;
  data: SubscriptionAuditResponse;
  showCandidatesOnly: boolean;
  onToggleCandidates: () => void;
  onDismiss: (key: string, name: string) => void;
}) {
  const visibleRows = showCandidatesOnly ? audit.cancelCandidates : audit.rows;
  const candidateCount = audit.cancelCandidates.length;

  return (
    <div className="space-y-6" data-testid="subscription-audit">
      {/* Summary */}
      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Annual cost of your subscriptions</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums" data-testid="subscription-annual-total">
              {money(audit.totalAnnualCostCents, data.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Cancel candidates</p>
            <p className="mt-1 text-2xl font-bold text-foreground" data-testid="cancel-candidate-count">
              {candidateCount}
            </p>
          </div>
          <Button
            onClick={onToggleCandidates}
            aria-pressed={showCandidatesOnly}
            data-testid="cancel-candidates-toggle"
          >
            {showCandidatesOnly ? "Show all subscriptions" : "Show cancel candidates"}
          </Button>
        </CardBody>
      </Card>

      {/* List */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">
              {showCandidatesOnly ? "Cancel candidates" : "Your subscriptions"}
            </h2>
            {showCandidatesOnly && (
              <span className="text-xs text-muted-foreground">Not charged on schedule — possibly stopped</span>
            )}
          </div>
          {visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="no-cancel-candidates">
              No cancel candidates right now.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200" data-testid="subscription-charges">
              {visibleRows.map((row) => (
                <li key={row.key} data-testid="subscription-row" className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground" title={row.name}>
                        {row.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {frequencyLabel(row.frequency)}
                        {row.source === "DETECTED"
                          ? ` · ${row.occurrences} sighting${row.occurrences === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-bold text-foreground tabular-nums" data-testid="subscription-amount">
                          {money(row.amountCents, data.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">per charge</p>
                      </div>
                      {row.source === "DETECTED" && (
                        <Button
                          size="sm"
                          onClick={() => onDismiss(row.key, row.name)}
                          data-testid="dismiss-subscription"
                        >
                          Not a subscription
                        </Button>
                      )}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Annual cost</dt>
                      <dd className="font-medium text-foreground tabular-nums" data-testid="subscription-annual-cost">
                        {money(row.annualCostCents, data.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last charged</dt>
                      <dd className="font-medium text-foreground" data-testid="subscription-last-charged">
                        {row.lastChargedDate ? fmtShort(row.lastChargedDate) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next expected</dt>
                      <dd className="font-medium text-foreground">
                        {row.nextDate ? fmtShort(row.nextDate) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium text-foreground">
                        {row.cancelCandidate ? (
                          <span className="text-rose-700" data-testid="cancel-candidate">
                            Cancel candidate
                          </span>
                        ) : row.paused ? (
                          <span className="text-muted-foreground" data-testid="paused">
                            Paused
                          </span>
                        ) : row.tracked ? (
                          <span data-testid="tracked">Tracked</span>
                        ) : (
                          "Active"
                        )}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
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
              {candidateCount} charge{candidateCount === 1 ? "" : "s"} look stopped or unused, worth{" "}
              <span className="tabular-nums">{money(audit.candidateAnnualCostCents, data.currency)}</span> a year.
            </p>
            <Button
              variant="link"
              onClick={onToggleCandidates}
              className="text-brand-700 underline"
              data-testid="view-cancel-candidates"
            >
              Review cancel candidates
            </Button>
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
          Based on {data.transactionCount} transactions from the last {HISTORY_DAYS} days
          {data.lastSyncedAt ? ` · last updated ${fmtShort(localDateOf(data.lastSyncedAt))}` : ""}
        </p>
        <Link href="/institutions" className="font-semibold text-brand-700 underline">
          Refresh your bank on Institutions
        </Link>
      </div>
    </div>
  );
}
