"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProjectionResponse, SavingsGoalDTO, SavingsGoalInput } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { centsToInputValue, parseMoneyToCents } from "@/domain/money";
import { evaluateSavingsGoal } from "@/domain/savings-goals";
import { useApi } from "@/lib/use-api";
import { LINK_TARGET_CLASS, scrollToLinkTarget, useLinkTarget } from "@/lib/use-link-target";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/field";
import { LinkTargetMissing } from "@/components/ui/link-target-missing";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, InlineStatus } from "@/components/ui/states";
import { money } from "@/lib/format";
import { fmtShort } from "@/lib/dates";
import { todayLocal } from "@/domain/dates";

const LINK_PARAMS = ["goal"] as const;

/** Checks the form's text; returns the input or the message to show. */
function goalInput(name: string, amount: string, date: string): SavingsGoalInput | string {
  const cents = parseMoneyToCents(amount);
  if (cents === null || cents <= 0) return "Enter a valid target amount.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Enter a valid target date (YYYY-MM-DD).";
  return { name: name || null, targetAmountCents: cents, targetDate: date };
}

/** `goalId` (`?goal=<id>`, from the command palette) marks that goal's card and opens it for editing. */
export function SavingsGoalsView({ goalId }: { goalId?: string } = {}) {
  const goals = useApi<SavingsGoalDTO[]>("savings-goals", api.listSavingsGoals);
  const projection = useApi<ProjectionResponse>("projection", () => api.getProjection());

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<SavingsGoalDTO | null>(null);
  const editFocusTarget = useRef<HTMLElement | null>(null);
  const openEdit = (goal: SavingsGoalDTO, trigger: HTMLElement | null) => {
    editFocusTarget.current = trigger;
    setEditing(goal);
  };

  const [linkTarget, clearLinkTarget] = useLinkTarget(goalId, LINK_PARAMS);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [linkMissing, setLinkMissing] = useState(false);
  useEffect(() => {
    if (!linkTarget || !goals.data) return;
    clearLinkTarget();
    const goal = goals.data.find((g) => g.id === linkTarget);
    setLinkedId(goal?.id ?? null);
    setLinkMissing(!goal);
    if (!goal) return;
    // The cards may still be waiting for the projection, so the dialog looks up the card's Edit button itself.
    editFocusTarget.current = null;
    setEditing(goal);
  }, [linkTarget, clearLinkTarget, goals.data]);

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const input = goalInput(name, amount, date);
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createSavingsGoal(input);
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
      {linkMissing && <LinkTargetMissing>That savings goal wasn&apos;t found. It may have been deleted.</LinkTargetMissing>}

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
              <Card
                key={g.id}
                ref={g.id === linkedId ? scrollToLinkTarget : undefined}
                className={cn(g.id === linkedId && LINK_TARGET_CLASS)}
                data-testid={`savings-goal-card-${g.id}`}
                data-linked={g.id === linkedId || undefined}
              >
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground" data-testid="savings-goal-name">
                        {g.name || "Savings goal"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Target {money(g.targetAmountCents, proj.currency)} by {fmtShort(g.targetDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => openEdit(g, e.currentTarget)}
                        aria-label={`Edit ${g.name || "savings goal"}`}
                        data-testid="savings-goal-edit"
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeGoal(g.id)} data-testid="savings-goal-delete">
                        Delete
                      </Button>
                    </div>
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

      <EditGoalDialog
        goal={editing}
        restoreFocusTarget={() => editFocusTarget.current ?? linkedEditButton(linkedId)}
        fallbackFocusTarget={() => linkedEditButton(linkedId)}
        onClose={() => setEditing(null)}
        onSaved={() => void goals.reload()}
      />
    </>
  );
}

function linkedEditButton(goalId: string | null): HTMLElement | null {
  if (!goalId) return null;
  return document.querySelector<HTMLElement>(`[data-testid="savings-goal-card-${goalId}"] [data-testid="savings-goal-edit"]`);
}

function EditGoalDialog({
  goal,
  restoreFocusTarget,
  fallbackFocusTarget,
  onClose,
  onSaved,
}: {
  goal: SavingsGoalDTO | null;
  restoreFocusTarget: () => HTMLElement | null;
  fallbackFocusTarget: () => HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each goal opened starts from its saved values.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (goal && goal.id !== loadedId) {
    setLoadedId(goal.id);
    setName(goal.name ?? "");
    setAmount(centsToInputValue(goal.targetAmountCents));
    setDate(goal.targetDate);
    setError(null);
  }

  function close() {
    if (saving) return;
    setLoadedId(null);
    onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!goal) return;
    const input = goalInput(name, amount, date);
    if (typeof input === "string") {
      setError(input);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateSavingsGoal(goal.id, input);
      setSaving(false);
      setLoadedId(null);
      onSaved();
      onClose();
    } catch (err) {
      setSaving(false);
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={goal !== null}
      onClose={close}
      title="Edit savings goal"
      size="sm"
      testId="savings-goal-edit-dialog"
      restoreFocusTarget={restoreFocusTarget}
      fallbackFocusTarget={fallbackFocusTarget}
      footer={
        <>
          <Button className="w-full sm:w-auto" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button className="w-full sm:w-auto" type="submit" form={formId} variant="primary" loading={saving} data-testid="savings-goal-save">
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={save} noValidate className="flex flex-col gap-4" aria-busy={saving}>
        {error && <InlineStatus tone="error">{error}</InlineStatus>}
        <Field label="Name" optional>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation" data-testid="savings-goal-edit-name" />
        </Field>
        <Field label="Target amount">
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="savings-goal-edit-amount" />
        </Field>
        <Field label="Target date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="savings-goal-edit-date" />
        </Field>
      </form>
    </Dialog>
  );
}
