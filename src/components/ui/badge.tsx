import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

type Tone = "neutral" | "positive" | "negative" | "info" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
  positive: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  negative: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-brand-50 text-brand-700 ring-brand-100",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
