"use client";

import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api-client";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";
import { useDialogFocus, type DialogFocusTarget } from "./dialog";
import { Button } from "./button";
import { InlineStatus } from "./states";

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onError,
  restoreFocusTarget,
  fallbackFocusTarget,
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
  onError?: (message: string) => void;
  /** Optional trigger to focus after the dialog closes. */
  restoreFocusTarget?: DialogFocusTarget;
  fallbackFocusTarget?: DialogFocusTarget;
  testId?: string;
}) {
  const restoreFocus = useDialogFocus(open, restoreFocusTarget, fallbackFocusTarget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (busy) return;
    setError(null);
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        data-testid={testId}
        onCloseAutoFocus={restoreFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <InlineStatus tone="error">{error}</InlineStatus>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} data-testid="confirm-cancel">Cancel</AlertDialogCancel>
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
                const message = errorMessage(err);
                setError(message);
                onError?.(message);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
