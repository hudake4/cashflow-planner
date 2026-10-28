"use client";

import { useMemo, useState } from "react";
import type { InstitutionDTO } from "@/contracts/api";
import { aprToInputText, parseAprInput } from "@/domain/apr";
import { estimateMinimumPaymentCents, planDebtPayoff } from "@/domain/debt-payoff";
import { api, errorMessage } from "@/lib/api-client";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input as FieldInput } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

interface DebtCard {
  id: string;
  institutionId: string;
  name: string;
  balanceCents: number;
  /** null = no APR stored; the planner treats it as 0%. */
  aprBasisPoints: number | null;
  minimumPaymentCents: number | null;
}

function toCards(institutions: InstitutionDTO[]): DebtCard[] {
  return institutions.flatMap((inst) =>
    inst.accounts
      .filter((a) => a.kind === "CREDIT")
      .map((a) => ({
        id: a.id,
        institutionId: inst.id,
        name: a.name,
        balanceCents: Math.abs(a.balanceCents),
        aprBasisPoints: a.aprBasisPoints,
        minimumPaymentCents: null,
      })),
  );
}

/** A card with no balance is skipped by the planner, so a missing APR on it changes nothing. */
const needsApr = (card: DebtCard) => card.aprBasisPoints === null && card.balanceCents > 0;

function AprCell({ card, onSaved }: { card: DebtCard; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const stored = aprToInputText(card.aprBasisPoints);
  const [text, setText] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Re-sync when a reload brings in a different stored value (adjusting state during render, not in an effect).
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setText(stored);
  }

  async function save() {
    const parsed = parseAprInput(text);
    if (!parsed.ok) {
      setError("Enter a rate like 19.99");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.setAccountCardFields(card.institutionId, card.id, { aprBasisPoints: parsed.basisPoints });
      await onSaved();
      toast(`Saved APR for ${card.name}.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const errorId = `debt-apr-error-${card.id}`;
  return (
    <form
      className="flex items-start justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="w-24 space-y-1 text-left">
        <FieldInput
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`APR % for ${card.name}`}
          aria-describedby={error ? errorId : undefined}
          invalid={!!error}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          className="h-8 w-full px-2 text-sm tabular-nums"
          data-testid={`debt-apr-${card.id}`}
        />
        {error && (
          <p id={errorId} className="text-xs font-medium text-destructive" data-testid={`debt-apr-error-${card.id}`}>
            {error}
          </p>
        )}
      </div>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={saving}
        disabled={text.trim() === stored}
        aria-label={`Save APR for ${card.name}`}
        data-testid={`debt-apr-save-${card.id}`}
      >
        Save
      </Button>
    </form>
  );
}

export function DebtPayoffView() {
  const institutions = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const [paymentInput, setPaymentInput] = useState("500.00");

  const data = institutions.data;
  const cards = useMemo(() => (data ? toCards(data) : []), [data]);
  const missingApr = useMemo(() => cards.filter(needsApr), [cards]);
  // The planner takes a plain number; a missing APR is passed as 0% here and flagged in the UI instead.
  const planCards = useMemo(() => cards.map((c) => ({ ...c, aprBasisPoints: c.aprBasisPoints ?? 0 })), [cards]);

  const paymentCents = useMemo(() => {
    const n = Number(paymentInput);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [paymentInput]);

  const snowball = useMemo(() => (planCards.length ? planDebtPayoff(planCards, paymentCents, "snowball") : null), [planCards, paymentCents]);
  const avalanche = useMemo(() => (planCards.length ? planDebtPayoff(planCards, paymentCents, "avalanche") : null), [planCards, paymentCents]);

  if (institutions.error && !institutions.data) {
    return (
      <>
        <PageHeader title="Debt payoff" description="Compare snowball and avalanche payoff plans for your credit cards." />
        <ErrorState message={institutions.error} onRetry={institutions.reload} title="Couldn't load your cards" />
      </>
    );
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
              Split across {cards.length} card{cards.length === 1 ? "" : "s"}. Minimum payments are estimated at 2% of balance (floor $25.00).
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-semibold">Your cards</h2>
        </CardHeader>
        <CardBody>
          <Table>
            <TableCaption className="sr-only">Credit-card balance, APR and assumed minimum payment</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Card</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                <TableHead className="text-right">APR %</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Assumed minimum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => {
                const minimum = money(card.minimumPaymentCents ?? estimateMinimumPaymentCents(card.balanceCents));
                return (
                  <TableRow key={card.id} data-testid={`debt-card-row-${card.id}`}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{card.name}</span>
                      {needsApr(card) && (
                        <Badge tone="warning" className="ml-2" data-testid={`debt-apr-needed-${card.id}`}>
                          APR needed
                        </Badge>
                      )}
                      {/* Balance and minimum have their own columns from sm up; below that they fold under the name so the APR field stays on screen. */}
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground sm:hidden">
                        {`Balance ${money(card.balanceCents)} · min ${minimum}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(card.balanceCents)}</TableCell>
                    <TableCell>
                      <AprCell card={card} onSaved={institutions.reload} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{minimum}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {missingApr.length > 0 && (
        <Alert role="status" className="mb-6 rounded-control border-border bg-muted p-4" data-testid="debt-apr-warning">
          <AlertTitle className="font-semibold text-foreground">
            {missingApr.length === 1 ? "1 card has no APR" : `${missingApr.length} cards have no APR`}
          </AlertTitle>
          <AlertDescription className="mt-1 text-sm text-muted-foreground">
            {missingApr.map((c) => c.name).join(", ")} {missingApr.length === 1 ? "is" : "are"} counted at 0% interest, so total interest is too low and avalanche
            cannot rank {missingApr.length === 1 ? "it" : "them"} by rate. Enter the APR above to get accurate plans.
          </AlertDescription>
        </Alert>
      )}

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
                plan.payoffPossible ? (
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
                    {missingApr.length > 0 && (
                      <p
                        className="text-xs font-medium text-amber-700 dark:text-amber-400"
                        data-testid={`debt-apr-caveat-${label.includes("Snowball") ? "snowball" : "avalanche"}`}
                      >
                        Not accurate yet: {missingApr.length === 1 ? "a card has" : `${missingApr.length} cards have`} no APR and {missingApr.length === 1 ? "is" : "are"} counted at 0%.
                      </p>
                    )}
                  </div>
                ) : (
                  <p
                    className="text-sm font-medium text-amber-600 dark:text-amber-400"
                    data-testid={`debt-warning-${label.includes("Snowball") ? "snowball" : "avalanche"}`}
                  >
                    At this payment the balance will not go down, so it will never be paid off. Increase the payment to see a plan.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Enter a monthly payment to see a plan.</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {snowball && avalanche && snowball.payoffPossible && (
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
            {missingApr.length > 0 && (
              <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="debt-apr-caveat-comparison">
                Not accurate yet: cards with no APR are counted at 0%, so both interest totals are too low.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}