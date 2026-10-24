import { clsx } from "clsx";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  testId,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId ?? "empty-state"}
      className={clsx(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = "Couldn't load this",
  className,
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={clsx("flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center", className)}
    >
      <CircleAlert className="h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-900">{title}</p>
        <p className="text-sm text-rose-800">{message}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm" data-testid="retry-button">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
        </Button>
      )}
    </div>
  );
}

/** Inline form-level status (success or error). */
export function InlineStatus({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      data-testid={tone === "error" ? "form-error" : "form-success"}
      className={clsx(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        tone === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800",
      )}
    >
      {tone === "error" ? (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}
