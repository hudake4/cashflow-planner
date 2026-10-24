"use client";

import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  BILL_FREQUENCIES,
  INCOME_FREQUENCIES,
  billInputSchema,
  incomeInputSchema,
  type BillDTO,
  type BillInput,
  type IncomeDTO,
  type IncomeInput,
} from "@/contracts/api";
import { centsToInputValue, parseMoneyToCents } from "@/domain/money";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { todayLocal } from "@/lib/dates";
import { FREQUENCY_LABELS } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FieldGroup, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export type ScheduleKind = "bill" | "income";
type FieldErrors = Partial<Record<string, string[]>>;

interface FormState {
  name: string;
  amount: string;
  frequency: string;
  anchorDate: string;
  endDate: string;
  category: string;
  notes: string;
  active: boolean;
}

function initialState(kind: ScheduleKind, item?: BillDTO | IncomeDTO | null): FormState {
  if (item) {
    return {
      name: item.name,
      amount: centsToInputValue(item.amountCents),
      frequency: item.frequency,
      anchorDate: item.anchorDate,
      endDate: item.endDate ?? "",
      category: "category" in item ? (item.category ?? "") : "",
      notes: item.notes ?? "",
      active: item.active,
    };
  }
  return {
    name: "",
    amount: "",
    frequency: kind === "income" ? "BIWEEKLY" : "MONTHLY",
    anchorDate: todayLocal(),
    endDate: "",
    category: "",
    notes: "",
    active: true,
  };
}

/** Maps a Zod error to { field: [messages] } using the top-level path segment. */
function zodFieldErrors(issues: { path: (string | number)[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const BILL_CATEGORIES = ["Housing", "Utilities", "Insurance", "Transportation", "Subscriptions", "Debt", "Groceries", "Phone & Internet", "Health", "Other"];

export function ScheduleFormDialog({
  kind,
  open,
  item,
  onClose,
  onSaved,
}: {
  kind: ScheduleKind;
  open: boolean;
  /** When set, the dialog edits this item; otherwise it creates a new one. */
  item?: BillDTO | IncomeDTO | null;
  onClose: () => void;
  onSaved?: (saved: BillDTO | IncomeDTO) => void;
}) {
  // Remount the inner form whenever the dialog opens for a different item so state resets cleanly.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? (kind === "bill" ? "Edit bill" : "Edit income") : kind === "bill" ? "Add a bill" : "Add income"}
      description={
        kind === "bill"
          ? "Recurring or one-time expenses that will leave your account."
          : "Paychecks and other money you expect to receive."
      }
      variant="drawer"
      size="lg"
      testId={`${kind}-form-dialog`}
    >
      {open && <ScheduleForm key={item?.id ?? "new"} kind={kind} item={item} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function ScheduleForm({
  kind,
  item,
  onClose,
  onSaved,
}: {
  kind: ScheduleKind;
  item?: BillDTO | IncomeDTO | null;
  onClose: () => void;
  onSaved?: (saved: BillDTO | IncomeDTO) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialState(kind, item));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const errKey = key === "amount" ? "amountCents" : key;
      if (!e[errKey]) return e;
      const next = { ...e };
      delete next[errKey];
      return next;
    });
  };

  const frequencies = kind === "bill" ? BILL_FREQUENCIES : INCOME_FREQUENCIES;
  const oneTime = form.frequency === "ONE_TIME";
  const testPrefix = kind;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    setFormError(null);

    const focusFirstInvalidField = () => {
      requestAnimationFrame(() => {
        formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
    };

    const amountCents = parseMoneyToCents(form.amount);
    const clientErrors: FieldErrors = {};
    if (form.amount.trim() === "") clientErrors.amountCents = ["Amount is required"];
    else if (amountCents === null) clientErrors.amountCents = ["Enter an amount like 1250 or 1,250.00 (up to 2 decimals)"];

    const payload = {
      name: form.name,
      amountCents: amountCents ?? Number.NaN,
      frequency: form.frequency,
      anchorDate: form.anchorDate,
      endDate: oneTime ? null : form.endDate || null,
      notes: form.notes || null,
      active: form.active,
      ...(kind === "bill" ? { category: form.category || null } : {}),
    };

    const parsed = kind === "bill" ? billInputSchema.safeParse(payload) : incomeInputSchema.safeParse(payload);
    if (!parsed.success) {
      const zodErrors = zodFieldErrors(parsed.error.issues);
      // Keep the friendlier amount message from the parser when present.
      setErrors({ ...zodErrors, ...clientErrors });
      focusFirstInvalidField();
      toast("Please fix the highlighted fields.", "error");
      return;
    }
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      focusFirstInvalidField();
      toast("Please fix the highlighted fields.", "error");
      return;
    }

    setSaving(true);
    try {
      let saved: BillDTO | IncomeDTO;
      if (kind === "bill") {
        const input = payload as BillInput;
        saved = item ? await api.updateBill(item.id, input) : await api.createBill(input);
      } else {
        const input = payload as IncomeInput;
        saved = item ? await api.updateIncome(item.id, input) : await api.createIncome(input);
      }
      toast(`${kind === "bill" ? "Bill" : "Income"} “${saved.name}” ${item ? "updated" : "added"}.`, "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const mapped: FieldErrors = {};
        for (const [path, messages] of Object.entries(err.fieldErrors)) {
          const key = path.split(".")[0] || "form";
          (mapped[key] ??= []).push(...messages);
        }
        setErrors(mapped);
        focusFirstInvalidField();
        setFormError(err.message || "Please fix the highlighted fields.");
        toast(err.message || "Please fix the highlighted fields.", "error");
      } else {
        const message = errorMessage(err);
        setFormError(message);
        toast(message, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  const unknownErrors = Object.entries(errors)
    .filter(([k]) => !["name", "amountCents", "frequency", "anchorDate", "endDate", "category", "notes", "active"].includes(k))
    .flatMap(([, v]) => v ?? []);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-busy={saving}
      data-testid={`${testPrefix}-form`}
    >
      <FieldGroup className="gap-4">
        {formError && <InlineStatus tone="error">{formError}</InlineStatus>}
        {unknownErrors.length > 0 && <InlineStatus tone="error">{unknownErrors.join(" ")}</InlineStatus>}

      <Field label="Name" error={errors.name} testId={`${testPrefix}-name`}>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={kind === "bill" ? "e.g. Rent" : "e.g. Paycheck"}
          maxLength={80}
          autoFocus
          data-testid={`${testPrefix}-name`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === "bill" ? "Amount per occurrence" : "Amount per payday"}
          error={errors.amountCents}
          testId={`${testPrefix}-amount`}
        >
          <MoneyInput
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0.00"
            data-testid={`${testPrefix}-amount`}
          />
        </Field>
        <Field label="How often" error={errors.frequency} testId={`${testPrefix}-frequency`}>
          <Select value={form.frequency} onChange={(e) => set("frequency", e.target.value)} data-testid={`${testPrefix}-frequency`}>
            {frequencies.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <FrequencyHelp kind={kind} frequency={form.frequency} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={
            oneTime
              ? kind === "bill"
                ? "Due date"
                : "Pay date"
              : kind === "bill"
                ? "First (or next) due date"
                : "First (or next) payday"
          }
          error={errors.anchorDate}
          testId={`${testPrefix}-anchor-date`}
        >
          <Input
            type="date"
            value={form.anchorDate}
            onChange={(e) => set("anchorDate", e.target.value)}
            data-testid={`${testPrefix}-anchor-date`}
          />
        </Field>
        {!oneTime && (
          <Field
            label="End date"
            optional
            hint="Last possible date (inclusive). Leave blank to repeat indefinitely."
            error={errors.endDate}
            testId={`${testPrefix}-end-date`}
          >
            <Input
              type="date"
              value={form.endDate}
              min={form.anchorDate || undefined}
              onChange={(e) => set("endDate", e.target.value)}
              data-testid={`${testPrefix}-end-date`}
            />
          </Field>
        )}
      </div>

      {kind === "bill" && (
        <Field label="Category" optional error={errors.category} testId="bill-category">
          <Input
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            list="bill-category-options"
            maxLength={40}
            placeholder="e.g. Housing"
            data-testid="bill-category"
          />
        </Field>
      )}
      {kind === "bill" && (
        <datalist id="bill-category-options">
          {BILL_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}

      <Field label="Notes" optional error={errors.notes} testId={`${testPrefix}-notes`}>
        <Textarea
          rows={2}
          value={form.notes}
          maxLength={500}
          onChange={(e) => set("notes", e.target.value)}
          data-testid={`${testPrefix}-notes`}
        />
      </Field>

      <Switch
        checked={form.active}
        onChange={(v) => set("active", v)}
        label="Active"
        description={
          form.active
            ? "Included in your projection."
            : "Paused: kept for reference but not included in your projection."
        }
        testId={`${testPrefix}-active`}
      />
      </FieldGroup>

      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col-reverse gap-2 border-t border-border bg-muted px-5 py-3 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" onClick={onClose} disabled={saving} data-testid={`${testPrefix}-form-cancel`}>
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="submit"
          variant="primary"
          loading={saving}
          data-testid={`${testPrefix}-form-submit`}
        >
          {item ? "Save changes" : kind === "bill" ? "Add bill" : "Add income"}
        </Button>
      </div>
    </form>
  );
}

function FrequencyHelp({ kind, frequency }: { kind: ScheduleKind; frequency: string }) {
  let text: string | null = null;
  if (frequency === "BIWEEKLY")
    text = `Every 2 weeks means every 14 days counted from the first ${kind === "income" ? "payday" : "due date"} you enter.`;
  else if (frequency === "WEEKLY") text = `Repeats every 7 days from the first ${kind === "income" ? "payday" : "due date"}.`;
  else if (frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "YEARLY")
    text =
      "Repeats on the same day of the month. If that day is the 29th–31st and a month is shorter, it falls on that month’s last day instead.";
  else if (frequency === "ONE_TIME") text = "Happens once, on the date below.";
  if (!text) return null;
  return (
    <Alert role="status" className="-mt-1 flex items-start gap-2 rounded-control border-border bg-muted px-3 py-2 text-xs">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <AlertDescription className="text-xs text-muted-foreground" data-testid="frequency-help">
        {text}
      </AlertDescription>
    </Alert>
  );
}
