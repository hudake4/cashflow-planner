"use client";

import { useEffect, useState } from "react";
import type { BillDTO, IncomeDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ScheduleFormDialog, type ScheduleKind } from "./schedule-form-dialog";

/** Loads a bill or income source by id, then opens the shared edit form. */
export function EditSourceDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { kind: ScheduleKind; id: string } | null;
  onClose: () => void;
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

  if (!target) return null;

  if (item) {
    return <ScheduleFormDialog kind={target.kind} open item={item} onClose={onClose} onSaved={onSaved} />;
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={target.kind === "bill" ? "Edit bill" : "Edit income"}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error ? (
        <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      )}
    </Dialog>
  );
}
