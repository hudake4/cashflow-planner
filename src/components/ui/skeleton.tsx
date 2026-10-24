import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx("animate-pulse rounded-md bg-slate-200", className)} />;
}

/** Wraps skeleton content with a screen-reader loading announcement. */
export function LoadingRegion({ label = "Loading", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" data-testid="loading">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
