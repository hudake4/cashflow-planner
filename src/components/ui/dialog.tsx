"use client";

import type { ReactNode } from "react";
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
}) {
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
        className={cn(
          "grid w-full gap-0 overflow-hidden border border-border bg-popover p-0 text-popover-foreground shadow-xl",
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
            <Button variant="ghost" size="icon" aria-label="Close" data-testid="dialog-close">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </ShadcnDialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <ShadcnDialogFooter className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted px-5 py-3">
            {footer}
          </ShadcnDialogFooter>
        )}
      </ShadcnDialogContent>
    </DialogRoot>
  );
}
