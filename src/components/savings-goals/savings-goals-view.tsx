"use client";

import { useState } from "react";
import type { ProjectionResponse, SavingsGoalDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { parseMoneyToCents } from "@/domain/money";
import { evaluateSavingsGoal } from "@/domain/savings-goals";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, MoneyInput } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { money } from "@/lib/format";
import { fmtShort } from "@/lib/dates";
import { todayLocal } from "@/domain/dates";

export function SavingsGoalsView() {
  const goals = useApi<SavingsGoalDTO[]>("savings-goals", api.listSavingsGoals);
  const projection = useApi<ProjectionResponse>("projection", () => api.getProjection());

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(amount);
    if (cents === null || cents <= 0) {
      setError("Enter a valid target amount.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter a valid target date (YYYY-MM-DD).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createSavingsGoal({ name: name || null, targetAmountCents: cents, targetDate: date });
      setName("");
      setAmount("");
      setDate("");
      await goals.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeGoal(id: string) {
    try {
      await api.deleteSavingsGoal(id);
      await goals.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const proj = projection.data;
  const today = todayLocal();

  return (
    <>
      <PageHeader title="Savings Goals" description="See whether your forecast supports reaching a target amount by a target date." />
      {error && <p className="mb-4 text-sm text-destructive" data-testid="savings-goals-error">{error}</p>}

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={addGoal} className="grid gap-4 sm:grid-cols-4" data-testid="savings-goal-form">
            <Field label="Name" optional>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation" />
            </Field>
            <Field label="Target amount">
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Target date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} data-testid="savings-goal-add">
                {saving ? "Adding..." : "Add goal"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {goals.error && !goals.data ? (
        <ErrorState message={goals.error} onRetry={goals.reload} title="Couldn't load goals" />
      ) : !goals.data || !proj ? (
        <LoadingRegion label="Loading savings goals">
          <Skeleton className="h-24 w-full" />
        </LoadingRegion>
      ) : goals.data.length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          description="Add a target amount and date to see whether your forecast supports it."
          testId="savings-goals-empty"
        />
      ) : (
        <div className="space-y-4" data-testid="savings-goals-list">
          {goals.data.map((g) => {
            const evaluation = evaluateSavingsGoal(proj, g, today);
            return (
              <Card key={g.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground" data-testid="savings-goal-name">
                        {g.name || "Savings goal"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Target {money(g.targetAmountCents, proj.currency)} by {fmtShort(g.targetDate)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeGoal(g.id)} data-testid="savings-goal-delete">
                      Delete
                    </Button>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-4">
                    <div data-testid="savings-goal-supported">
                      {evaluation.supported ? "Supported by forecast" : "Not supported"}
                    </div>
                    <div data-testid="savings-goal-projected">
                      Projected {money(evaluation.projectedBalanceCents, proj.currency)}
                    </div>
                    <div data-testid="savings-goal-shortfall">
                      Shortfall {money(evaluation.shortfallCents, proj.currency)}
                    </div>
                    <div data-testid="savings-goal-weekly">
                      Weekly needed {money(evaluation.weeklyAmountNeededCents, proj.currency)} ({evaluation.weeksRemaining} wk)
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
