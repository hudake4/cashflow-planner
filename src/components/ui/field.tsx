"use client";

import { clsx } from "clsx";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const controlBase =
  "block w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 " +
  "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function controlClass(invalid?: boolean, extra?: string) {
  return clsx(controlBase, invalid ? "border-rose-600" : "border-slate-300", extra);
}

type ControlProps = { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx("h-10", className))} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(function Select(
  { invalid, className, ...props },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx("h-10 pr-8", className))} {...props} />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps>(
  function Textarea({ invalid, className, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, clsx("py-2", className))} {...props} />;
  },
);

/** Money input with a currency prefix; value is the raw string (parsed with parseMoneyToCents on submit). */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps & { prefix?: string }>(
  function MoneyInput({ invalid, className, prefix = "$", ...props }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-500" aria-hidden="true">
          {prefix}
        </span>
        <input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          className={controlClass(invalid, clsx("h-10 tabular-nums", prefix.length > 1 ? "pl-12" : "pl-7", className))}
          {...props}
        />
      </div>
    );
  },
);

/**
 * Label + control + hint + error. The child control receives id,
 * aria-describedby and invalid automatically.
 */
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
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-500">(optional)</span>}
      </label>
      {isValidElement(children) ? cloneElement(children, { id, "aria-describedby": describedBy, invalid: !!errorText }) : children}
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {errorText && (
        <p id={errorId} className="text-xs font-medium text-rose-700" data-testid={testId ? `${testId}-error` : undefined}>
          {errorText}
        </p>
      )}
    </div>
  );
}

/** Accessible on/off switch (a checkbox with role="switch"). */
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
  return (
    <div className="flex items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          data-testid={testId}
          aria-describedby={description ? `${id}-desc` : undefined}
        />
        <span
          aria-hidden="true"
          className={clsx(
            // pointer-events-none: the translated knob would otherwise sit above the checkbox and eat clicks.
            "pointer-events-none flex h-6 w-11 items-center rounded-full p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600",
            checked ? "bg-brand-600" : "bg-slate-300",
          )}
        >
          <span className={clsx("h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
        </span>
      </span>
      <span>
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-slate-800">
          {label}
        </label>
        {description && (
          <span id={`${id}-desc`} className="block text-xs text-slate-600">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
