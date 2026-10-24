"use client";

import { Ban, CircleCheck, Pencil, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { LedgerEvent, OccurrenceStatus } from "@/contracts/api";
import { centsToInputValue, parseMoneyToCents } from "@/domain/money";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDayShort } from "@/lib/dates";
import { FREQUENCY_LABELS } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogFocusTarget } from "@/components/ui/dialog";
import { Field, MoneyInput } from "@/components/ui/field";
import { Balance, EventAmount } from "@/components/ui/money";
import { InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function EventDetailDialog({
  event,
  currency,
  onClose,
  restoreFocusOnClose,
  restoreFocusTarget,
  onChanged,
  onEditSource,
}: {
  event: LedgerEvent | null;
  currency: string;
  onClose: () => void;
  restoreFocusOnClose?: boolean;
  restoreFocusTarget?: DialogFocusTarget;
  /** Called after any successful mutation; should refetch the projection. */
  onChanged: () => Promise<void> | void;
  onEditSource: (event: LedgerEvent) => void;
}) {
  return (
    <Dialog
      restoreFocusOnClose={restoreFocusOnClose}
      restoreFocusTarget={restoreFocusTarget}
      open={event !== null}
      onClose={onClose}
      title={event?.name ?? ""}
      description={event ? `${event.kind === "INCOME" ? "Income" : "Bill"} on ${fmtDayShort(event.date)}` : undefined}
      variant="drawer"
      size="md"
      testId="event-detail"
    >
      {event && (
        <EventDetailBody
          key={event.id}
          event={event}
          currency={currency}
          onChanged={onChanged}
          onEditSource={onEditSource}
        />
      )}
    </Dialog>
  );
}

function EventDetailBody({
  event,
  currency,
  onChanged,
  onEditSource,
}: {
  event: LedgerEvent;
  currency: string;
  onChanged: () => Promise<void> | void;
  onEditSource: (event: LedgerEvent) => void;
}) {
  const toast = useToast();
  const isBill = event.kind === "BILL";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState(event.amountOverridden ? centsToInputValue(event.amountCents) : "");
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const currentOverride = event.amountOverridden ? event.amountCents : null;
  const status = event.status as OccurrenceStatus | "SCHEDULED";

  async function run(label: string, action: () => Promise<unknown>, message: string) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await onChanged();
      toast(message, "success");
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast(message, "error");
    } finally {
      setBusy(null);
    }
  }

  /** Set status, keeping any existing per-date amount override. Resetting a plain occurrence deletes its row. */
  const setStatus = (next: OccurrenceStatus) => {
    const label = next === "PAID" ? "Marked paid." : next === "SKIPPED" ? "Marked skipped. It no longer counts toward the balance." : "Reset to upcoming.";
    if (next === "UPCOMING" && currentOverride === null) {
      return run(next, () => api.resetOccurrence(event.sourceId, event.date), label);
    }
    return run(next, () => api.setOccurrence(event.sourceId, event.date, { status: next, amountOverrideCents: currentOverride }), label);
  };

  const saveOverride = (e: FormEvent) => {
    e.preventDefault();
    setOverrideError(null);
    const cents = parseMoneyToCents(override);
    if (cents === null || cents <= 0) {
      setOverrideError("Enter an amount greater than zero, like 84.50");
      return;
    }
    const nextStatus: OccurrenceStatus = status === "SCHEDULED" ? "UPCOMING" : status;
    void run("override", () => api.setOccurrence(event.sourceId, event.date, { status: nextStatus, amountOverrideCents: cents }), "Amount updated for this date.");
  };

  const clearOverride = () => {
    const nextStatus: OccurrenceStatus = status === "SCHEDULED" ? "UPCOMING" : status;
    setOverride("");
    if (nextStatus === "UPCOMING") return run("clear", () => api.resetOccurrence(event.sourceId, event.date), "Back to the default amount.");
    return run("clear", () => api.setOccurrence(event.sourceId, event.date, { status: nextStatus, amountOverrideCents: null }), "Back to the default amount.");
  };

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Amount</dt>
          <dd className="text-base font-semibold">
            <EventAmount
              kind={event.kind}
              amountCents={event.amountCents}
              currency={currency}
              muted={status === "SKIPPED"}
              className={status === "SKIPPED" ? "line-through" : undefined}
            />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Balance after</dt>
          <dd className="text-base font-semibold">
            <Balance cents={event.balanceAfterCents} currency={currency} testId="event-detail-balance" />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Repeats</dt>
          <dd>{FREQUENCY_LABELS[event.frequency]}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="flex flex-wrap gap-1" data-testid="event-detail-status">
            {status === "PAID" && <Badge tone="positive"><CircleCheck className="h-3 w-3" aria-hidden="true" />Paid</Badge>}
            {status === "SKIPPED" && <Badge tone="neutral"><Ban className="h-3 w-3" aria-hidden="true" />Skipped</Badge>}
            {status === "UPCOMING" && <Badge tone="info">Upcoming</Badge>}
            {status === "SCHEDULED" && <Badge tone="info">Scheduled</Badge>}
            {event.amountOverridden && <Badge tone="warning">Amount adjusted</Badge>}
          </dd>
        </div>
        {event.category && (
          <div>
            <dt className="text-slate-500">Category</dt>
            <dd>{event.category}</dd>
          </div>
        )}
      </dl>

      {status === "SKIPPED" && (
        <p className="rounded-control bg-slate-100 px-3 py-2 text-xs text-slate-700">
          Skipped occurrences are shown for reference but don&apos;t change the projected balance.
        </p>
      )}
      {status === "PAID" && (
        <p className="rounded-control bg-slate-100 px-3 py-2 text-xs text-slate-700">
          “Paid” is a tracking mark. The bill still counts once on its due date. To match your real bank balance, update the starting
          balance and start date in Settings.
        </p>
      )}

      {error && <InlineStatus tone="error">{error}</InlineStatus>}

      {isBill && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">This occurrence</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={status === "PAID" ? "success" : "secondary"}
              size="sm"
              className="h-auto min-h-11"
              loading={busy === "PAID"}
              disabled={busy !== null || status === "PAID"}
              aria-pressed={status === "PAID"}
              onClick={() => void setStatus("PAID")}
              data-testid="occurrence-mark-paid"
            >
              <CircleCheck className="h-4 w-4" aria-hidden="true" /> Mark paid
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-auto min-h-11"
              loading={busy === "SKIPPED"}
              disabled={busy !== null || status === "SKIPPED"}
              aria-pressed={status === "SKIPPED"}
              onClick={() => void setStatus("SKIPPED")}
              data-testid="occurrence-mark-skipped"
            >
              <Ban className="h-4 w-4" aria-hidden="true" /> Mark skipped
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-auto min-h-11"
              loading={busy === "UPCOMING"}
              disabled={busy !== null || status === "UPCOMING"}
              onClick={() => void setStatus("UPCOMING")}
              data-testid="occurrence-reset"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset to upcoming
            </Button>
          </div>

          <form onSubmit={saveOverride} noValidate className="space-y-2 pt-2">
            <Field
              label="Amount for this date only"
              optional
              hint="For variable bills. Other dates keep the default amount."
              error={overrideError}
              testId="occurrence-override"
            >
              <MoneyInput
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="Default amount"
                prefix={currency === "USD" ? "$" : currency}
                data-testid="occurrence-override"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="primary" loading={busy === "override"} disabled={busy !== null} data-testid="occurrence-override-save">
                Save amount
              </Button>
              {event.amountOverridden && (
                <Button size="sm" variant="ghost" loading={busy === "clear"} disabled={busy !== null} onClick={() => void clearOverride()} data-testid="occurrence-override-clear">
                  Use default amount
                </Button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="border-t border-slate-200 pt-4">
        <Button onClick={() => onEditSource(event)} data-testid={isBill ? "event-edit-bill" : "event-edit-income"} className="min-h-11 w-full sm:w-auto">
          <Pencil className="h-4 w-4" aria-hidden="true" /> {isBill ? "Edit bill" : "Edit income"}
        </Button>
        <p className="mt-2 text-xs text-slate-500">Changes the {isBill ? "bill" : "income"} for every date, not just this one.</p>
      </div>
    </div>
  );
}
