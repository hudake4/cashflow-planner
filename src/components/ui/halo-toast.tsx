"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type HaloToastTone = "success" | "error";

export function HaloToast({
  toastId,
  message,
  tone = "success",
}: {
  toastId: string | number;
  message: string;
  tone?: HaloToastTone;
}) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  const accent = tone === "success" ? "emerald" : "rose";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid={`toast-${tone}`}
      className={cn(
        "relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-sheet border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg",
        tone === "success" ? "border-t-emerald-700" : "border-t-rose-700",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "success" ? "text-emerald-700" : "text-rose-700")} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-foreground">{message}</p>
      <span className="sr-only">{accent === "emerald" ? "Saved" : "Error"}</span>
      <button
        type="button"
        onClick={() => toast.dismiss(toastId)}
        className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
