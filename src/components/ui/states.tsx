import { cn } from "@/lib/utils";
import { CircleAlert, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import { Card } from "./card";

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
    <Card
      data-testid={testId ?? "empty-state"}
      className={cn("flex flex-col items-center justify-center border-dashed border-slate-300 px-6 py-14 text-center", className)}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-sheet bg-muted text-muted-foreground" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="font-semiwide text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
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
    <Alert
      variant="destructive"
      role="alert"
      data-testid="error-state"
      className={cn("flex flex-col items-start gap-3 border-rose-200 bg-rose-50 p-5 sm:flex-row sm:items-center", className)}
    >
      <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <AlertTitle className="font-semibold text-rose-900">{title}</AlertTitle>
        <AlertDescription className="text-sm text-rose-800">{message}</AlertDescription>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm" data-testid="retry-button">
          <RefreshCw aria-hidden="true" data-icon="inline-start" /> Retry
        </Button>
      )}
    </Alert>
  );
}

/** Inline form-level status (success or error). */
export function InlineStatus({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <Alert
      variant={tone === "error" ? "destructive" : "default"}
      role={tone === "error" ? "alert" : "status"}
      data-testid={tone === "error" ? "form-error" : "form-success"}
      className={cn(
        "flex items-start gap-2 rounded-control px-3 py-2 text-sm",
        tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {tone === "error" && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <AlertDescription className={cn("text-sm", tone === "error" ? "text-rose-800" : "text-emerald-800")}>
        {children}
      </AlertDescription>
    </Alert>
  );
}
