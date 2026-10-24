"use client";

import { useRef, type FocusEvent as ReactFocusEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Dialog as DialogRoot,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent as ShadcnDialogContent,
  DialogDescription,
  DialogFooter as ShadcnDialogFooter,
  DialogHeader as ShadcnDialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./primitives/dialog";

export {
  DialogRoot,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};

export const DialogContent = ShadcnDialogContent;
export const DialogHeader = ShadcnDialogHeader;
export const DialogFooter = ShadcnDialogFooter;

export type DialogFocusTarget = HTMLElement | null | (() => HTMLElement | null);

function resolveTarget(target?: DialogFocusTarget) {
  return typeof target === "function" ? target() : target;
}

function revealFocusedControl(event: ReactFocusEvent<HTMLDivElement>) {
  const target = event.target;
  if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
}

/** Each open cycle owns its opener; replacement dialogs retain control of focus. */
export function useDialogFocus(open: boolean, restoreTarget?: DialogFocusTarget, fallbackTarget?: DialogFocusTarget, restoreOnClose = true) {
  const wasOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const handedOff = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    handedOff.current = false;
    const active = document.activeElement;
    opener.current = resolveTarget(restoreTarget) ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  }
  if (wasOpen.current && !open && !restoreOnClose) handedOff.current = true;
  wasOpen.current = open;

  return (event: Event) => {
    event.preventDefault();
    if (handedOff.current) return;
    const remainingDialog = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
    const candidates = [opener.current, resolveTarget(fallbackTarget)];
    for (const target of candidates) {
      if (!target?.isConnected || target.matches(":disabled") || target.closest('[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]')) continue;
      if (remainingDialog && !remainingDialog.contains(target)) continue;
      target.focus();
      if (document.activeElement === target) return;
    }
    if (remainingDialog) return;
    const heading = document.querySelector<HTMLElement>("main h1, h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  size = "md",
  testId,
  restoreFocusTarget,
  fallbackFocusTarget,
  restoreFocusOnClose = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Drawer mode is a bottom sheet on mobile and a right-side sheet on desktop. */
  variant?: "modal" | "drawer";
  size?: "sm" | "md" | "lg";
  testId?: string;
  /** Optional explicit target for focus restoration when the opener is not the active element. */
  restoreFocusTarget?: DialogFocusTarget;
  fallbackFocusTarget?: DialogFocusTarget;
  /** Disable restoration when this open cycle hands control to a replacement dialog. */
  restoreFocusOnClose?: boolean;
}) {
  const restoreFocus = useDialogFocus(open, restoreFocusTarget, fallbackFocusTarget, restoreFocusOnClose);

  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";
  const panelPlacement =
    variant === "drawer"
      ? "top-auto right-0 bottom-0 left-0 h-auto max-h-[92dvh] max-w-full translate-x-0 translate-y-0 rounded-t-dialog sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-dvh sm:max-h-none sm:max-w-md sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:rounded-l-dialog"
      : "top-auto bottom-0 left-0 max-h-[92dvh] max-w-full translate-x-0 translate-y-0 rounded-t-dialog sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[88dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-dialog";

  return (
    <DialogRoot open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <ShadcnDialogContent
        data-testid={testId}
        showCloseButton={false}
        onCloseAutoFocus={restoreFocus}
        className={cn(
          "grid grid-rows-[auto_minmax(0,1fr)_auto] w-full gap-0 overflow-hidden border border-border bg-popover p-0 text-popover-foreground shadow-xl",
          panelPlacement,
          variant === "modal" && width,
        )}
      >
        <ShadcnDialogHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="font-semiwide text-lg font-bold text-foreground">{title}</DialogTitle>
            {description && <DialogDescription className="mt-0.5 text-sm text-muted-foreground">{description}</DialogDescription>}
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="min-w-11 sm:min-w-0" aria-label="Close" data-testid="dialog-close">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </ShadcnDialogHeader>
        <div className="min-h-0 overflow-y-auto scroll-py-2 px-5 py-4" onFocusCapture={revealFocusedControl}>{children}</div>
        {footer && (
          <ShadcnDialogFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted px-5 py-3">
            {footer}
          </ShadcnDialogFooter>
        )}
      </ShadcnDialogContent>
    </DialogRoot>
  );
}
