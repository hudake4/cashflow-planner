import { clsx } from "clsx";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { kindMoney, money } from "@/lib/format";

/**
 * A balance as returned by the API. Negative balances are red AND carry an
 * alert icon plus an sr-only label, so color is never the only signal.
 */
export function Balance({
  cents,
  currency,
  className,
  iconClassName = "h-3.5 w-3.5",
  testId,
}: {
  cents: number;
  currency: string;
  className?: string;
  iconClassName?: string;
  testId?: string;
}) {
  const negative = cents < 0;
  return (
    <span
      data-testid={testId}
      data-negative={negative || undefined}
      className={clsx("inline-flex items-center gap-1 tabular-nums", negative && "font-semibold text-rose-700", className)}
    >
      {negative && <TriangleAlert className={clsx("shrink-0", iconClassName)} aria-hidden="true" />}
      {negative && <span className="sr-only">negative balance </span>}
      {money(cents, currency)}
    </span>
  );
}

/** A signed event amount: income green with + and up arrow; bills red with − and down arrow. */
export function EventAmount({
  kind,
  amountCents,
  currency,
  muted,
  className,
}: {
  kind: "INCOME" | "BILL";
  amountCents: number;
  currency: string;
  muted?: boolean;
  className?: string;
}) {
  const Icon = kind === "INCOME" ? ArrowUp : ArrowDown;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 font-medium tabular-nums whitespace-nowrap",
        muted ? "text-slate-500" : kind === "INCOME" ? "text-emerald-700" : "text-rose-700",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {kindMoney(kind, amountCents, currency)}
    </span>
  );
}
