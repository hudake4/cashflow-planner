"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Accessible modal built on the native <dialog> element. `showModal()` makes the
 * rest of the page inert (focus is contained), Escape closes it, and focus
 * returns to the previously focused element on close.
 */
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
  /** "drawer" slides in from the right on wide screens (bottom sheet on mobile). */
  variant?: "modal" | "drawer";
  size?: "sm" | "md" | "lg";
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      el.showModal();
      return () => {
        if (el.open) el.close();
        if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
      };
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, []);

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid={testId}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onCloseRef.current();
      }}
      className={clsx(
        "fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-slate-900 open:flex",
        variant === "modal" ? "items-end justify-center sm:items-center sm:p-4" : "items-end justify-end sm:items-stretch",
      )}
    >
      {open && (
        <div
          className={clsx(
            "flex w-full flex-col bg-sheet shadow-[0_24px_60px_-20px_rgb(23_42_51/0.45)]",
            variant === "modal"
              ? clsx("max-h-[92dvh] rounded-t-dialog sm:max-h-[88dvh] sm:rounded-dialog", widths[size])
              : "max-h-[92dvh] rounded-t-dialog sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-dialog",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-semiwide text-lg font-bold text-slate-900">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-0.5 text-sm text-slate-600">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="-mr-1 rounded-control p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
              data-testid="dialog-close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:rounded-b-dialog">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
