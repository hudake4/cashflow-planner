"use client";

import { useEffect, useState } from "react";
import type { BillDTO, IncomeDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogFocusTarget } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ScheduleForm, type ScheduleKind } from "./schedule-form-dialog";

/** Loads a bill or income source by id, then opens the shared edit form. */
export function EditSourceDialog({
  target,
  onClose,
  restoreFocusTarget,
  onSaved,
}: {
  target: { kind: ScheduleKind; id: string } | null;
  onClose: () => void;
  restoreFocusTarget?: DialogFocusTarget;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<BillDTO | IncomeDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setItem(null);
    setError(null);
    if (!target) return;
    let cancelled = false;
    const load = target.kind === "bill" ? api.getBill(target.id) : api.getIncome(target.id);
    load.then(
      (res) => !cancelled && setItem(res),
      (err) => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [target, attempt]);

  return (
    <Dialog
      restoreFocusTarget={restoreFocusTarget}
      open={target !== null}
      onClose={onClose}
      title={target?.kind === "bill" ? "Edit bill" : "Edit income"}
      description={item ? (target?.kind === "bill" ? "Recurring or one-time expenses that will leave your account." : "Paychecks and other money you expect to receive.") : "Loading the current schedule before editing."}
      testId={target && item ? `${target.kind}-form-dialog` : undefined}
      variant="drawer"
      size="lg"
      footer={!item && (
        <Button className="w-full sm:w-auto" onClick={onClose}>
          Close
        </Button>
      )}
    >
      {item && target ? (
        <ScheduleForm key={item.id} kind={target.kind} item={item} onClose={onClose} onSaved={onSaved} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      )}
    </Dialog>
  );
}
