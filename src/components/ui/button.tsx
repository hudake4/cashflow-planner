import { forwardRef, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton, buttonVariants } from "./primitives/button";

type LegacyVariant = "primary" | "secondary" | "danger" | "success";
type Variant = NonNullable<React.ComponentProps<typeof ShadcnButton>["variant"]> | LegacyVariant;
type Size = NonNullable<React.ComponentProps<typeof ShadcnButton>["size"]> | "md";

export interface ButtonProps extends Omit<React.ComponentProps<typeof ShadcnButton>, "variant" | "size" | "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

const legacyVariants: Partial<Record<LegacyVariant, string>> = {
  primary: "bg-brand-600 text-on-accent hover:bg-brand-700",
  secondary: "border border-slate-300 bg-sheet text-slate-800 hover:border-slate-400 hover:bg-field",
  danger: "bg-rose-700 text-on-accent hover:bg-rose-800 dark:bg-rose-700 dark:hover:bg-rose-800",
  success: "bg-emerald-700 text-on-accent hover:bg-emerald-800",
};

const legacySizes: Partial<Record<"sm" | "md" | "icon", string>> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  icon: "size-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    className,
    children,
    disabled,
    type = "button",
    asChild = false,
    onClickCapture,
    onKeyDownCapture,
    ...props
  },
  ref,
) {
  const unavailable = disabled || loading;
  const baseVariant =
    variant === "primary" || variant === "success"
      ? "default"
      : variant === "secondary"
        ? "outline"
        : variant === "danger"
          ? "destructive"
          : variant;

  return (
    <ShadcnButton
      ref={ref}
      type={type}
      variant={baseVariant}
      size={size === "md" ? "lg" : size}
      disabled={asChild ? undefined : unavailable}
      asChild={asChild}
      aria-busy={loading || undefined}
      aria-disabled={unavailable || undefined}
      onClickCapture={(event) => {
        if (asChild && unavailable) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClickCapture?.(event);
      }}
      onKeyDownCapture={(event) => {
        if (asChild && unavailable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onKeyDownCapture?.(event);
      }}
      className={cn(
        "min-h-11 rounded-control font-semibold transition-colors focus-visible:outline-none sm:min-h-0",
        size === "default" && "h-10 px-4",
        legacySizes[size as keyof typeof legacySizes],
        legacyVariants[variant as LegacyVariant],
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
    </ShadcnButton>
  );
});

export { buttonVariants };
