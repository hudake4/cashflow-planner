"use client";

import { cloneElement, forwardRef, isValidElement, useId, type ComponentProps, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Input as ShadcnInput } from "./input";
import { Textarea as ShadcnTextarea } from "./textarea";
import {
  Field as ShadcnField,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./primitives/field";

type ControlProps = { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, ComponentProps<typeof ShadcnInput> & ControlProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return (
    <ShadcnInput
      ref={ref}
      className={cn("h-10 rounded-control bg-field px-3 text-base text-foreground placeholder:text-slate-400 sm:text-sm", className)}
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(function Select(
  { invalid, className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "block h-10 w-full rounded-control border border-input bg-field px-3 pr-8 text-base text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 aria-invalid:border-destructive aria-invalid:focus:border-destructive disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm",
        className,
      )}
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<typeof ShadcnTextarea> & ControlProps>(
  function Textarea({ invalid, className, ...props }, ref) {
    return (
      <ShadcnTextarea
        ref={ref}
        className={cn("min-h-24 rounded-control bg-field px-3 py-2 text-base text-foreground placeholder:text-slate-400 sm:text-sm", className)}
        {...props}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
      />
    );
  },
);

/** Money input stays a raw decimal string; callers parse it to integer cents on submit. */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps & { prefix?: string }>(
  function MoneyInput({ invalid, className, prefix = "$", ...props }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-500" aria-hidden="true">
          {prefix}
        </span>
        <Input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          invalid={invalid}
          className={cn("h-10 tabular-nums", prefix.length > 1 ? "pl-12" : "pl-7", className)}
          {...props}
        />
      </div>
    );
  },
);

/** Label, control, hint, and error wrapper retained for the current feature components. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
  testId,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[] | null;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; invalid?: boolean }>;
  className?: string;
  optional?: boolean;
  testId?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const errorText = Array.isArray(error) ? error[0] : error;
  const describedBy = [hint ? hintId : null, errorText ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <ShadcnField data-invalid={!!errorText} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </FieldLabel>
      {isValidElement(children) ? cloneElement(children, { id, "aria-describedby": describedBy, invalid: !!errorText }) : children}
      {hint && <FieldDescription id={hintId} className="text-xs">{hint}</FieldDescription>}
      {errorText && (
        <FieldError id={errorId} data-testid={testId ? `${testId}-error` : undefined} className="text-xs font-medium">
          {errorText}
        </FieldError>
      )}
    </ShadcnField>
  );
}

/** Controlled switch adapter retained for current settings and form consumers. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  testId?: string;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <ShadcnField orientation="horizontal" className="items-start gap-3">
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          data-testid={testId}
          aria-describedby={description ? descriptionId : undefined}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none flex h-6 w-11 items-center rounded-full border border-input bg-input p-0.5 transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
        >
          <span className="size-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
      </span>
      <FieldContent className="gap-0.5">
        <FieldLabel htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">{label}</FieldLabel>
        {description && <FieldDescription id={descriptionId} className="text-xs">{description}</FieldDescription>}
      </FieldContent>
    </ShadcnField>
  );
}

export {
  ShadcnField as FieldPrimitive,
  ShadcnField as FieldRoot,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
