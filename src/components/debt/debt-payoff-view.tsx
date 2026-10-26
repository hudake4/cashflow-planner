"use client";

import { useMemo, useState } from "react";
import type { InstitutionDTO } from "@/contracts/api";
import { planDebtPayoff } from "@/domain/debt-payoff";
import { api } from "@/lib/api-client";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


function toCards(institutions: InstitutionDTO[]) {
  return institutions.flatMap((inst) =>
    inst.accounts
      .filter((a) => a.kind === "CREDIT")
      .map((a) => ({
        id: a.id,
        name: `${a.name}${inst.accounts.length > 1 ? "" : ""}`,
        balanceCents: Math.abs(a.balanceCents),
        aprBasisPoints: a.aprBasisPoints ?? 0,
        minimumPaymentCents: null as number | null,
      })),
  );
}

export function DebtPayoffView() {
  const institutions = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const [paymentInput, setPaymentInput] = useState("500.00");

  const data = institutions.data;
  const cards = useMemo(() => (data ? toCards(data) : []), [data]);

  const paymentCents = useMemo(() => {
    const n = Number(paymentInput);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [paymentInput]);

  const snowball = useMemo(() => (cards.length ? planDebtPayoff(cards, paymentCents, "snowball") : null), [cards, paymentCents]);
  const avalanche = useMemo(() => (cards.length ? planDebtPayoff(cards, paymentCents, "avalanche") : null), [cards, paymentCents]);

  if (institutions.error && !institutions.data) {
    return <ErrorState message={institutions.error} onRetry={institutions.reload} title="Couldn't load your cards" />;
  }
  if (!data) {
    return (
      <LoadingRegion label="Loading debt payoff">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </LoadingRegion>
    );
  }

  if (cards.length === 0) {
    return (
      <>
        <PageHeader title="Debt payoff" description="Compare snowball and avalanche payoff plans for your credit cards." />
        <EmptyState
          title="No credit cards found"
          description="Connect a bank on the Institutions page and label your credit-card accounts as Credit. Then come back here to compare payoff plans."
          testId="debt-empty-no-cards"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Debt payoff"
        description="Compare snowball (lowest balance first) and avalanche (highest APR first) payoff plans using your synced credit-card balances."
      />

      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="monthly-payment">Total monthly payment</Label>
              <Input
                id="monthly-payment"
                type="number"
                min={0}
                step="0.01"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                data-testid="debt-monthly-payment"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Split across {cards.length} card{cards.length === 1 ? "" : "s"}. Minimum payments are estimated at 2% of balance (floor $25.00) when no rule is set.
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { label: "Snowball (lowest balance first)", plan: snowball },
          { label: "Avalanche (highest APR first)", plan: avalanche },
        ].map(({ label, plan }) => (
          <Card key={label}>
            <CardHeader>
              <h2 className="text-base font-semibold">{label}</h2>
            </CardHeader>
            <CardBody>
              {plan ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Months to payoff</p>
                      <p className="text-2xl font-bold" data-testid={`debt-months-${label.includes("Snowball") ? "snowball" : "avalanche"}`}>
                        {plan.monthsToPayoff}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total interest</p>
                      <p className="text-2xl font-bold">{money(plan.totalInterestCents)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total paid</p>
                    <p className="font-medium">{money(plan.totalPaidCents)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.paidOff ? "All cards paid off." : "Not fully paid within the projection horizon."}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Enter a monthly payment to see a plan.</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {snowball && avalanche && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-base font-semibold">Comparison</h2>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Strategy</th>
                  <th className="py-1">Months</th>
                  <th className="py-1">Total interest</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1">Snowball</td>
                  <td className="py-1">{snowball.monthsToPayoff}</td>
                  <td className="py-1">{money(snowball.totalInterestCents)}</td>
                </tr>
                <tr>
                  <td className="py-1">Avalanche</td>
                  <td className="py-1">{avalanche.monthsToPayoff}</td>
                  <td className="py-1">{money(avalanche.totalInterestCents)}</td>
                </tr>
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </>
  );
}