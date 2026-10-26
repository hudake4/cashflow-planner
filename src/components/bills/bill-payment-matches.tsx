"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";
import type { BillMatchesResponse, BillPaymentMatchDTO } from "@/contracts/api";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const matchKey = (m: BillPaymentMatchDTO) => `${m.billId}:${m.dueDate}`;

/**
 * Offers to mark bill occurrences paid when a synced bank transaction looks like their payment.
 * Nothing is marked until the user confirms. "Paid" is a tracking mark only: the bill still counts
 * once on its due date and the projected balance does not change (CONVENTIONS section 5).
 * Renders nothing while loading, on error, or when there is nothing to offer, so it never gets in
 * the way of the bills list. "Not this one" lasts until the page is reloaded; nothing is stored.
 */
export function BillPaymentMatches({ onMarked }: { onMarked?: () => void }) {
  const toast = useToast();
  const matches = useApi<BillMatchesResponse>("bill-matches", api.listBillMatches);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visible = (matches.data?.matches ?? []).filter((m) => !dismissed.has(matchKey(m)));
  if (visible.length === 0) return null;
  const currency = matches.data?.currency ?? "USD";

  async function markPaid(m: BillPaymentMatchDTO) {
    const key = matchKey(m);
    setSaving(key);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
    try {
      // Keeps the occurrence's own amount override and note: only the status changes.
      await api.setOccurrence(m.billId, m.dueDate, { status: "PAID", amountOverrideCents: m.amountOverrideCents, note: m.note });
      toast(`${m.billName} on ${fmtShort(m.dueDate)} marked paid.`, "success");
      await matches.reload();
      onMarked?.();
    } catch (err) {
      const message = err instanceof ApiError && err.code === "VALIDATION_ERROR" ? `Couldn't mark this paid: ${err.message}` : errorMessage(err);
      setErrors((current) => ({ ...current, [key]: message }));
    } finally {
      setSaving(null);
    }
  }

  const dismiss = (m: BillPaymentMatchDTO) => setDismissed((current) => new Set(current).add(matchKey(m)));

  return (
    <Card className="mb-5" data-testid="bill-matches">
      <CardHeader
        as="h2"
        title="Paid in your bank?"
        description="These synced transactions look like payments of bills you haven't marked paid. Marking paid only keeps track: the bill still counts on its due date and your projected balance doesn't change."
      />
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {visible.map((m) => {
          const key = matchKey(m);
          const busy = saving === key;
          return (
            <li key={key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`bill-match-${key}`}>
              <div className="min-w-0 space-y-1 text-sm">
                <p className="truncate font-semibold text-foreground" title={m.billName}>
                  {m.billName} <span className="font-normal text-muted-foreground">due {fmtShort(m.dueDate)}</span>
                </p>
                <p className="text-muted-foreground">
                  <span className="break-words">{m.transaction.description}</span> · {fmtShort(m.transaction.date)} ·{" "}
                  <span className="whitespace-nowrap font-medium tabular-nums text-foreground">−{money(m.transaction.cents, currency)}</span>
                  {m.transaction.cents !== m.expectedCents && (
                    <span className="tabular-nums"> (bill expects {money(m.expectedCents, currency)})</span>
                  )}
                </p>
                {errors[key] && <InlineStatus tone="error">{errors[key]}</InlineStatus>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => dismiss(m)} disabled={busy} data-testid={`bill-match-dismiss-${key}`}>
                  Not this one
                </Button>
                <Button
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() => void markPaid(m)}
                  loading={busy}
                  disabled={saving !== null && !busy}
                  aria-label={`Mark ${m.billName} due ${fmtShort(m.dueDate)} paid`}
                  data-testid={`bill-match-paid-${key}`}
                >
                  {!busy && <CircleCheck className="size-4" aria-hidden="true" />} Mark paid
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
