"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DEFAULT_DEBT_MONTHLY_PAYMENT_CENTS, type InstitutionDTO, type SettingsDTO } from "@/contracts/api";
import { aprToInputText, parseAprInput } from "@/domain/apr";
import { toDebtAccounts, type DebtAccount } from "@/domain/debt-cards";
import { estimateMinimumPaymentCents, planDebtPayoff, type DebtPayoffSchedule } from "@/domain/debt-payoff";
import { centsToInputValue, parseMoneyToCents } from "@/domain/money";
import { api, errorMessage } from "@/lib/api-client";
import { addMonths, fmtDate, todayLocal } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";
import { Input as FieldInput } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

const PAGE_DESCRIPTION =
  "Compare snowball (lowest balance first) and avalanche (highest APR first) payoff plans using your synced credit-card and loan balances.";

/** A debt with no balance is skipped by the planner, so a missing APR on it changes nothing. */
const needsApr = (debt: DebtAccount) => debt.aprBasisPoints === null && debt.balanceCents > 0;

const accountCount = (n: number) => `${n} account${n === 1 ? "" : "s"}`;

type FieldParse = { ok: true; value: number | null } | { ok: false };

/**
 * One editable per-account number (APR or minimum payment): a text field plus Save. Blank clears the stored value.
 * Re-syncs when a reload brings in a different stored value.
 */
function DebtFieldCell({
  debt,
  fieldKey,
  label,
  savedLabel,
  stored,
  parse,
  errorText,
  placeholder,
  hint,
  widthClass,
  save,
  onSaved,
}: {
  debt: DebtAccount;
  fieldKey: "apr" | "min";
  /** Accessible name of the input, e.g. "APR % for Visa" is `${label} for ${debt.name}`. */
  label: string;
  /** Used in the Save button name and the toast, e.g. "APR" or "minimum payment". */
  savedLabel: string;
  stored: string;
  parse: (text: string) => FieldParse;
  errorText: string;
  placeholder?: string;
  hint?: ReactNode;
  widthClass: string;
  save: (value: number | null) => Promise<unknown>;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [text, setText] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Re-sync when a reload brings in a different stored value (adjusting state during render, not in an effect).
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setText(stored);
  }

  async function submit() {
    const parsed = parse(text);
    if (!parsed.ok) {
      setError(errorText);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await save(parsed.value);
      await onSaved();
      toast(`Saved ${savedLabel} for ${debt.name}.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const errorId = `debt-${fieldKey}-error-${debt.id}`;
  return (
    <form
      // Below sm the Save button sits under its input so the APR and minimum fields both fit on a phone.
      className="flex flex-col items-end gap-1 sm:flex-row sm:items-start sm:justify-end sm:gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={`${widthClass} space-y-1 text-left`}>
        <FieldInput
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} for ${debt.name}`}
          aria-describedby={error ? errorId : undefined}
          invalid={!!error}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          className="h-8 w-full px-2 text-sm tabular-nums"
          data-testid={`debt-${fieldKey}-${debt.id}`}
        />
        {error && (
          <p id={errorId} className="text-xs font-medium text-destructive" data-testid={errorId}>
            {error}
          </p>
        )}
        {!error && hint}
      </div>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={saving}
        disabled={text.trim() === stored}
        aria-label={`Save ${savedLabel} for ${debt.name}`}
        data-testid={`debt-${fieldKey}-save-${debt.id}`}
      >
        Save
      </Button>
    </form>
  );
}

function parseMinimumInput(text: string): FieldParse {
  if (text.trim() === "") return { ok: true, value: null };
  const cents = parseMoneyToCents(text);
  return cents === null || cents <= 0 ? { ok: false } : { ok: true, value: cents };
}

function AprCell({ debt, onSaved }: { debt: DebtAccount; onSaved: () => Promise<void> }) {
  return (
    <DebtFieldCell
      debt={debt}
      fieldKey="apr"
      label="APR %"
      savedLabel="APR"
      stored={aprToInputText(debt.aprBasisPoints)}
      parse={(text) => {
        const parsed = parseAprInput(text);
        return parsed.ok ? { ok: true, value: parsed.basisPoints } : { ok: false };
      }}
      errorText="Enter a rate like 19.99"
      widthClass="w-16 sm:w-24"
      save={(value) => api.setAccountCardFields(debt.institutionId, debt.id, { aprBasisPoints: value })}
      onSaved={onSaved}
    />
  );
}

function MinimumCell({ debt, onSaved }: { debt: DebtAccount; onSaved: () => Promise<void> }) {
  const estimate = estimateMinimumPaymentCents(debt.balanceCents);
  return (
    <DebtFieldCell
      debt={debt}
      fieldKey="min"
      label="Minimum payment $"
      savedLabel="minimum payment"
      stored={debt.minimumPaymentCents === null ? "" : centsToInputValue(debt.minimumPaymentCents)}
      parse={parseMinimumInput}
      errorText="Enter an amount like 35.00"
      placeholder={centsToInputValue(estimate)}
      hint={
        debt.minimumPaymentCents === null && (
          <p className="text-xs text-muted-foreground" data-testid={`debt-min-estimated-${debt.id}`}>
            Estimated
          </p>
        )
      }
      widthClass="w-20 sm:w-28"
      save={(value) => api.setAccountCardFields(debt.institutionId, debt.id, { minimumPaymentCents: value })}
      onSaved={onSaved}
    />
  );
}

/** Total monthly payment: typed freely (the plans follow it live), saved to settings on Save so it survives a reload. */
function MonthlyPaymentField({
  storedCents,
  draft,
  onDraft,
  onSaved,
}: {
  storedCents: number;
  draft: string | null;
  onDraft: (text: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = centsToInputValue(storedCents);
  const text = draft ?? stored;

  async function save() {
    const cents = parseMoneyToCents(text);
    if (cents === null) {
      setError("Enter an amount like 500.00");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.patchSettings({ debtMonthlyPaymentCents: cents });
      await onSaved();
      onDraft(null);
      toast("Saved your monthly payment.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="monthly-payment">Total monthly payment</Label>
        <FieldInput
          id="monthly-payment"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-describedby={error ? "monthly-payment-error" : undefined}
          invalid={!!error}
          value={text}
          onChange={(e) => {
            onDraft(e.target.value);
            setError(null);
          }}
          className="w-40 tabular-nums"
          data-testid="debt-monthly-payment"
        />
        {error && (
          <p id="monthly-payment-error" className="text-xs font-medium text-destructive" data-testid="debt-monthly-payment-error">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" variant="secondary" loading={saving} disabled={text.trim() === stored} data-testid="debt-monthly-payment-save">
        Save payment
      </Button>
    </form>
  );
}

/** "Debt-free by <month year>" and a collapsible month-by-month table for one strategy. */
function PlanDetails({ plan, strategy, today }: { plan: DebtPayoffSchedule; strategy: "snowball" | "avalanche"; today: string }) {
  const [open, setOpen] = useState(false);
  if (plan.monthsToPayoff === 0) return null;
  const monthStart = (month: number) => addMonths(today, month);

  return (
    <>
      {plan.paidOff && (
        <p className="text-sm font-medium" data-testid={`debt-free-${strategy}`}>
          Debt-free by {fmtDate(monthStart(plan.monthsToPayoff), "MMMM yyyy")}
        </p>
      )}
      <Expandable expanded={open} onToggle={() => setOpen((v) => !v)} transitionDuration={0.18}>
        {({ isExpanded }) => (
          <>
            <ExpandableTrigger
              aria-label={`${isExpanded ? "Hide" : "Show"} the ${strategy} month-by-month schedule`}
              data-testid={`debt-schedule-toggle-${strategy}`}
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isExpanded ? "Hide" : "Show"} month-by-month schedule
              {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </ExpandableTrigger>
            <ExpandableContent preset="fade">
              <div className="max-h-72 overflow-auto rounded-control border border-border" data-testid={`debt-schedule-${strategy}`}>
                <Table className="w-full text-sm">
                  <TableCaption className="sr-only">Payment, interest and remaining balance for each month of the {strategy} plan</TableCaption>
                  <TableHeader className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <TableRow>
                      <TableHead scope="col">Month</TableHead>
                      <TableHead scope="col" className="text-right">Paid</TableHead>
                      <TableHead scope="col" className="text-right">Interest</TableHead>
                      <TableHead scope="col" className="text-right">Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="whitespace-normal">
                          <span className="tabular-nums">{fmtDate(monthStart(m.month), "MMM yyyy")}</span>
                          {m.paidOffCards.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Paid off: {m.paidOffCards.map((id) => m.cards.find((c) => c.id === id)?.name ?? id).join(", ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.totalPaymentCents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.totalInterestCents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(m.remainingBalanceCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ExpandableContent>
          </>
        )}
      </Expandable>
    </>
  );
}

export function DebtPayoffView() {
  const institutions = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const settings = useApi<SettingsDTO>("settings", api.getSettings);
  // null = show the stored payment; a string = what the user is typing and hasn't saved.
  const [paymentDraft, setPaymentDraft] = useState<string | null>(null);
  const [today] = useState(todayLocal);

  const data = institutions.data;
  const debts = useMemo(() => (data ? toDebtAccounts(data) : []), [data]);
  const missingApr = useMemo(() => debts.filter(needsApr), [debts]);
  // The planner takes a plain number; a missing APR is passed as 0% here and flagged in the UI instead.
  const planCards = useMemo(() => debts.map((d) => ({ ...d, aprBasisPoints: d.aprBasisPoints ?? 0 })), [debts]);

  const storedPaymentCents = settings.data?.debtMonthlyPaymentCents ?? DEFAULT_DEBT_MONTHLY_PAYMENT_CENTS;
  const paymentCents = useMemo(
    () => (paymentDraft === null ? storedPaymentCents : (parseMoneyToCents(paymentDraft) ?? 0)),
    [paymentDraft, storedPaymentCents],
  );

  const snowball = useMemo(() => (planCards.length ? planDebtPayoff(planCards, paymentCents, "snowball") : null), [planCards, paymentCents]);
  const avalanche = useMemo(() => (planCards.length ? planDebtPayoff(planCards, paymentCents, "avalanche") : null), [planCards, paymentCents]);

  if (institutions.error && !institutions.data) {
    return (
      <>
        <PageHeader title="Debt payoff" description="Compare snowball and avalanche payoff plans for your credit cards and loans." />
        <ErrorState message={institutions.error} onRetry={institutions.reload} title="Couldn't load your debts" />
      </>
    );
  }
  // A failed settings load falls back to the default payment rather than blocking the page.
  if (!data || (!settings.data && !settings.error)) {
    return (
      <LoadingRegion label="Loading debt payoff">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </LoadingRegion>
    );
  }

  if (debts.length === 0) {
    return (
      <>
        <PageHeader title="Debt payoff" description="Compare snowball and avalanche payoff plans for your credit cards and loans." />
        <EmptyState
          title="No credit cards or loans found"
          description="Connect a bank on the Institutions page and label your credit-card and loan accounts as Credit or Loan. Then come back here to compare payoff plans."
          testId="debt-empty-no-cards"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Debt payoff" description={PAGE_DESCRIPTION} />

      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <MonthlyPaymentField storedCents={storedPaymentCents} draft={paymentDraft} onDraft={setPaymentDraft} onSaved={settings.reload} />
            <p className="max-w-prose text-sm text-muted-foreground">
              Split across {accountCount(debts.length)}. Where you haven&apos;t entered a minimum payment, it is estimated at 2% of the balance (floor $25.00). That is a
              credit-card guess, so enter the real payment for loans.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base font-semibold">Your debts</h2>
        </CardHeader>
        <CardBody>
          <Table>
            <TableCaption className="sr-only">Credit-card and loan balance, APR and minimum payment</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Account</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                <TableHead className="text-right">APR %</TableHead>
                <TableHead className="text-right">
                  <span className="sm:hidden">Min.</span>
                  <span className="hidden sm:inline">Minimum payment</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.map((debt) => {
                const minimum = money(debt.minimumPaymentCents ?? estimateMinimumPaymentCents(debt.balanceCents));
                return (
                  <TableRow key={debt.id} data-testid={`debt-card-row-${debt.id}`}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{debt.name}</span>
                      {debt.kind === "LOAN" && (
                        <Badge tone="info" className="ml-2" data-testid={`debt-loan-${debt.id}`}>
                          Loan
                        </Badge>
                      )}
                      {needsApr(debt) && (
                        <Badge tone="warning" className="ml-2" data-testid={`debt-apr-needed-${debt.id}`}>
                          APR needed
                        </Badge>
                      )}
                      {/* The balance has its own column from sm up; below that it folds under the name so the editable fields stay on screen. */}
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground sm:hidden">
                        {`Balance ${money(debt.balanceCents)} · min ${minimum}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(debt.balanceCents)}</TableCell>
                    <TableCell>
                      <AprCell debt={debt} onSaved={institutions.reload} />
                    </TableCell>
                    <TableCell>
                      <MinimumCell debt={debt} onSaved={institutions.reload} />
                    </TableCell>
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
            {missingApr.length === 1 ? "1 account has no APR" : `${missingApr.length} accounts have no APR`}
          </AlertTitle>
          <AlertDescription className="mt-1 text-sm text-muted-foreground">
            {missingApr.map((c) => c.name).join(", ")} {missingApr.length === 1 ? "is" : "are"} counted at 0% interest, so total interest is too low and avalanche
            cannot rank {missingApr.length === 1 ? "it" : "them"} by rate. Enter the APR above to get accurate plans.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            { strategy: "snowball", label: "Snowball (lowest balance first)", plan: snowball },
            { strategy: "avalanche", label: "Avalanche (highest APR first)", plan: avalanche },
          ] as const
        ).map(({ strategy, label, plan }) => (
          <Card key={strategy}>
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
                        <p className="text-2xl font-bold" data-testid={`debt-months-${strategy}`}>
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
                      {plan.paidOff ? "All debts paid off." : "Not fully paid within the projection horizon."}
                    </p>
                    {missingApr.length > 0 && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid={`debt-apr-caveat-${strategy}`}>
                        Not accurate yet: {missingApr.length === 1 ? "an account has" : `${missingApr.length} accounts have`} no APR and {missingApr.length === 1 ? "is" : "are"} counted at 0%.
                      </p>
                    )}
                    <PlanDetails plan={plan} strategy={strategy} today={today} />
                  </div>
                ) : (
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400" data-testid={`debt-warning-${strategy}`}>
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
                Not accurate yet: accounts with no APR are counted at 0%, so both interest totals are too low.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
