"use client";

import type { ComponentProps, CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { cn } from "@/lib/utils";

type ToasterProps = ComponentProps<typeof SonnerToaster>;

export function Toaster({ className, style, ...props }: ToasterProps) {
  const tokenStyles = {
    "--normal-bg": "var(--popover)",
    "--normal-text": "var(--popover-foreground)",
    "--normal-border": "var(--border)",
    "--border-radius": "var(--radius-sheet)",
    "--success-bg": "var(--color-emerald-50)",
    "--success-text": "var(--color-emerald-800)",
    "--success-border": "var(--color-emerald-200)",
    "--error-bg": "var(--color-rose-50)",
    "--error-text": "var(--color-rose-800)",
    "--error-border": "var(--color-rose-200)",
  } as CSSProperties;

  return <SonnerToaster className={cn("cashflow-toaster", className)} style={{ ...tokenStyles, ...style }} {...props} />;
}
