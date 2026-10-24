"use client";

import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api-client";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { InlineStatus } from "./states";

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  testId = "confirm-dialog",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Should throw on failure; the error is shown inside the dialog. */
  onConfirm: () => Promise<void>;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      testId={testId}
      footer={
        <>
          <Button onClick={close} disabled={busy} data-testid="confirm-cancel">
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={busy}
            data-testid="confirm-submit"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                setBusy(false);
                onClose();
              } catch (err) {
                setBusy(false);
                setError(errorMessage(err));
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        {description}
        {error && <InlineStatus tone="error">{error}</InlineStatus>}
      </div>
    </Dialog>
  );
}
