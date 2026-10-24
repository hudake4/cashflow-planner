"use client";

import { CircleCheck, Landmark, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { BillInput, IncomeInput, RecurringScanResponse, RecurringSuggestionDTO } from "@/contracts/api";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { fmtDate, fmtShort } from "@/lib/dates";
import { FREQUENCY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EventAmount } from "@/components/ui/money";
import { InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const NOTE = "Found in your bank history.";

function toInput(s: RecurringSuggestionDTO): BillInput | IncomeInput {
  const base = { name: s.name, amountCents: s.amountCents, frequency: s.frequency, anchorDate: s.nextDate, endDate: null, notes: NOTE, active: true };
  return s.kind === "BILL" ? { ...base, category: null } : base;
}

/**
 * One button that scans the stored bank history for repeating payments and deposits, then walks
 * the user through them in a small pop-up: add each as a bill or income, or skip it. Dates and
 * frequency come from the scan, so nothing has to be typed.
 */
export function RecurringScanButton({ onAdded, className }: { onAdded?: () => void; className?: string }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<RecurringScanResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    try {
      setResult(await api.scanRecurring());
      setIndex(0);
      setAdded(0);
      setError(null);
      setOpen(true);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setScanning(false);
    }
  }

  const suggestions = result?.suggestions ?? [];
  const current: RecurringSuggestionDTO | undefined = suggestions[index];
  const isBill = current?.kind === "BILL";

  async function add() {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      if (current.kind === "BILL") await api.createBill(toInput(current) as BillInput);
      else await api.createIncome(toInput(current) as IncomeInput);
      toast(`${current.kind === "BILL" ? "Bill" : "Income"} “${current.name}” added.`, "success");
      setAdded((n) => n + 1);
      setIndex((i) => i + 1);
      onAdded?.();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "VALIDATION_ERROR" ? `Couldn't add this one: ${err.message}` : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const skip = () => {
    setError(null);
    setIndex((i) => i + 1);
  };
  const close = () => setOpen(false);

  const footer = current ? (
    <>
      <Button onClick={skip} disabled={saving} data-testid="recurring-skip">
        Skip
      </Button>
      <Button variant="primary" onClick={() => void add()} loading={saving} data-testid="recurring-add">
        {isBill ? "Add as bill" : "Add as income"}
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={close} data-testid="recurring-close">
      {result && result.connectionCount === 0 ? "Not now" : "Done"}
    </Button>
  );

  return (
    <>
      <Button loading={scanning} onClick={() => void scan()} className={cn("min-h-11", className)} data-testid="scan-recurring-button">
        {!scanning && <ScanSearch className="h-4 w-4" aria-hidden="true" />} Find recurring
      </Button>

      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title="Recurring payments"
        description={current ? `${index + 1} of ${suggestions.length} found in your bank history` : undefined}
        footer={footer}
        testId="recurring-dialog"
      >
        {current ? (
          <div className="flex flex-col gap-3" data-testid="recurring-suggestion">
            {error && <InlineStatus tone="error">{error}</InlineStatus>}
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {isBill ? "Suggested bill" : "Suggested income"}
              </p>
              <p className="mt-1 truncate text-lg font-bold text-foreground" title={current.name}>
                {current.name}
              </p>
              <EventAmount kind={current.kind} amountCents={current.amountCents} currency={result?.currency ?? "USD"} className="text-xl font-bold" />
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">How often</dt>
              <dd className="font-medium text-foreground">{FREQUENCY_LABELS[current.frequency]}</dd>
              <dt className="text-muted-foreground">Next {isBill ? "due" : "payday"}</dt>
              <dd className="font-medium text-foreground">{fmtShort(current.nextDate)}</dd>
              <dt className="text-muted-foreground">Seen</dt>
              <dd className="font-medium text-foreground">
                {current.seenDates.length}× ({current.seenDates.map((d) => fmtDate(d, "MMM d")).join(", ")})
              </dd>
            </dl>
            {current.amountVaries && (
              <p className="text-xs text-muted-foreground">The amount changed a little between occurrences; this uses the latest.</p>
            )}
          </div>
        ) : result && result.connectionCount === 0 ? (
          <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground" data-testid="recurring-no-bank">
            <Landmark className="size-5" aria-hidden="true" />
            <p>Connect a bank first, so there are transactions to look through. Everything stays on this computer.</p>
            <Link href="/institutions" onClick={close} className="font-semibold text-brand-700 underline">
              Go to Institutions
            </Link>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground" data-testid="recurring-none">
            <p className="font-semibold text-foreground">Nothing new found.</p>
            <p>
              Looked through {result?.transactionCount ?? 0} transactions from the last 89 days
              {result?.lastSyncedAt ? ` (last updated ${fmtShort(result.lastSyncedAt.slice(0, 10))})` : ""} and every
              repeating payment is already a bill or income. Weekly payments need 3 sightings and monthly ones 2.
            </p>
            <p>Refresh your bank on the Institutions page to include the newest activity.</p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 text-sm" data-testid="recurring-done">
            <CircleCheck className="size-6 text-emerald-700" aria-hidden="true" />
            <p className="font-semibold text-foreground">
              {added === 0 ? "No changes made." : `Added ${added} to your plan.`}
            </p>
            <p className="text-muted-foreground">You can edit any of them later from the Bills and Income pages.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
