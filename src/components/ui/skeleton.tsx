import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton as ShadcnSkeleton } from "./primitives/skeleton";

export function Skeleton({ className, ...props }: ComponentProps<typeof ShadcnSkeleton>) {
  return <ShadcnSkeleton aria-hidden="true" className={cn("rounded-control bg-slate-200", className)} {...props} />;
}

/** Wrap skeleton content with a screen-reader loading announcement. */
export function LoadingRegion({ label = "Loading", children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="loading">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
