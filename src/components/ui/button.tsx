import { clsx } from "clsx";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-on-accent hover:bg-brand-700",
  secondary: "bg-sheet text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-field",
  ghost: "text-slate-700 hover:bg-slate-200/60",
  danger: "bg-rose-700 text-on-accent hover:bg-rose-800",
  success: "bg-emerald-700 text-on-accent hover:bg-emerald-800",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  icon: "h-9 w-9 justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-control font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
