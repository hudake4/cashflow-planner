import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Badge as ShadcnBadge, badgeVariants } from "./primitives/badge";

type Tone = "neutral" | "positive" | "negative" | "info" | "warning";
type Variant = NonNullable<React.ComponentProps<typeof ShadcnBadge>["variant"]>;

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  positive: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  negative: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-brand-50 text-brand-700 ring-brand-100",
  warning: "bg-highlight text-slate-900 ring-slate-300",
};

export function Badge({
  tone,
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; variant?: Variant; asChild?: boolean }) {
  const resolvedVariant = variant ?? (tone ? "outline" : "secondary");

  return (
    <ShadcnBadge
      variant={resolvedVariant}
      className={cn("h-auto rounded-chip px-1.5 py-px text-xs font-semibold ring-1 ring-inset", tone && tones[tone], className)}
      {...props}
    />
  );
}

export { badgeVariants };
