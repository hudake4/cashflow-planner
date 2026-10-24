"use client";

import { Database, HardDrive, Sparkles, Trash } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  MAX_FORECAST_DAYS,
  MIN_FORECAST_DAYS,
  settingsInputSchema,
  type SettingsDTO,
  type SettingsInput,
} from "@/contracts/api";
import { centsToInputValue, parseMoneyToCents } from "@/domain/money";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { CURRENCIES } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ErrorState, InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PRESETS = [30, 60, 90, 180, 365];

export function SettingsView({ appVersion }: { appVersion: string }) {
  const settings = useApi<SettingsDTO>("settings", api.getSettings);
  const [confirm, setConfirm] = useState<"demo" | "reset" | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const toast = useToast();

  const afterDataChange = async (message: string) => {
    toast(message);
    await settings.reload();
    setFormVersion((v) => v + 1);
  };

  return (
    <>
      <PageHeader title="Settings" description="Your starting point and how projections are displayed." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          {settings.error && !settings.data ? (
            <ErrorState message={settings.error} onRetry={settings.reload} />
          ) : !settings.data ? (
            <LoadingRegion label="Loading settings">
              <Card className="space-y-4 p-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </Card>
            </LoadingRegion>
          ) : (
            <SettingsForm
              key={formVersion}
              initial={settings.data}
              onSaved={() => void settings.reload()}
            />
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Data" description="Manage what's stored in this app." />
            <CardBody className="space-y-4">
              <p className="flex items-start gap-2 rounded-control bg-slate-100 px-3 py-2 text-sm text-slate-700">
                <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                All data stays on this computer. Nothing is sent anywhere, and there is no bank connection.
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => setConfirm("demo")} data-testid="load-demo-button">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Load demo data
                </Button>
                <p className="text-xs text-slate-600">Replaces your current income, bills and paid/skipped marks with sample data.</p>
              </div>
              <div className="space-y-2">
                <Button
                  className="w-full border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={() => setConfirm("reset")}
                  data-testid="clear-data-button"
                >
                  <Trash className="h-4 w-4" aria-hidden="true" /> Clear all data
                </Button>
                <p className="text-xs text-slate-600">Deletes everything and restores default settings.</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-600" data-testid="app-version">
        CashFlow Planner version <span className="tabular-nums">{appVersion}</span>
      </p>

      <ConfirmDialog
        open={confirm === "demo"}
        onClose={() => setConfirm(null)}
        title="Load demo data?"
        confirmLabel="Replace with demo data"
        tone="primary"
        testId="confirm-demo-dialog"
        description={
          <>
            <p>
              This <strong className="font-semibold text-slate-900">replaces all of your current income, bills and paid/skipped marks</strong>{" "}
              with clearly labeled demo entries (named “Demo: …”).
            </p>
            <p>It also sets the projection start date to today and the starting balance to $1,250.00. This can&apos;t be undone.</p>
          </>
        }
        onConfirm={async () => {
          await api.loadDemoData();
          await afterDataChange("Demo data loaded.");
        }}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title="Clear all data?"
        confirmLabel="Clear everything"
        testId="confirm-reset-dialog"
        description={
          <p className="flex items-start gap-2">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
            <span>
              This permanently deletes all income, bills and paid/skipped marks, and resets settings to their defaults. This can&apos;t be
              undone.
            </span>
          </p>
        }
        onConfirm={async () => {
          await api.resetAllData();
          await afterDataChange("All data cleared.");
        }}
      />
    </>
  );
}

function SettingsForm({ initial, onSaved }: { initial: SettingsDTO; onSaved: () => void }) {
  const toast = useToast();
  const [balance, setBalance] = useState(centsToInputValue(initial.startingBalanceCents));
  const [startDate, setStartDate] = useState(initial.projectionStartDate);
  const [currency, setCurrency] = useState(initial.currency);
  const [forecastDays, setForecastDays] = useState(String(initial.forecastDays));
  const [preset, setPreset] = useState(PRESETS.includes(initial.forecastDays) ? String(initial.forecastDays) : "custom");
  const [weekStartsOn, setWeekStartsOn] = useState(String(initial.weekStartsOn));
  const [view, setView] = useState(initial.defaultCalendarView);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const currencyOptions = CURRENCIES.some((c) => c.code === initial.currency)
    ? CURRENCIES
    : [{ code: initial.currency, label: initial.currency }, ...CURRENCIES];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const cents = parseMoneyToCents(balance, { allowNegative: true });
    const clientErrors: Record<string, string[]> = {};
    if (cents === null) clientErrors.startingBalanceCents = ["Enter a balance like 1250.00 or -40.00 (up to 2 decimals)"];
    const days = /^\d+$/.test(forecastDays.trim()) ? Number(forecastDays) : Number.NaN;

    const payload: SettingsInput = {
      startingBalanceCents: cents ?? Number.NaN,
      projectionStartDate: startDate,
      currency,
      forecastDays: days,
      weekStartsOn: Number(weekStartsOn),
      defaultCalendarView: view,
    };
    const parsed = settingsInputSchema.safeParse(payload);
    if (!parsed.success || Object.keys(clientErrors).length) {
      const out: Record<string, string[]> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) (out[String(issue.path[0])] ??= []).push(issue.message);
      }
      if (Number.isNaN(days)) out.forecastDays = [`Enter a whole number of days from ${MIN_FORECAST_DAYS} to ${MAX_FORECAST_DAYS}`];
      setErrors({ ...out, ...clientErrors });
      setStatus({ tone: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await api.saveSettings(payload);
      setStatus({ tone: "success", text: "Settings saved. Projections now use these values." });
      toast("Settings saved.");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) (out[k.split(".")[0]] ??= []).push(...v);
        setErrors(out);
      }
      setStatus({ tone: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-testid="settings-form">
      <Card>
        <CardHeader title="Starting point" description="Enter what's in your account so projections start from reality." />
        <CardBody className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Starting balance"
              hint="Your actual balance at the start of the projection start date, before anything due that day. Can be negative."
              error={errors.startingBalanceCents}
              testId="settings-starting-balance"
            >
              <MoneyInput
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                prefix={currency === "USD" ? "$" : currency}
                data-testid="settings-starting-balance"
              />
            </Field>
            <Field
              label="Projection start date"
              hint="Income and bills on or after this date are projected."
              error={errors.projectionStartDate}
              testId="settings-start-date"
            >
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="settings-start-date" />
            </Field>
          </div>
        </CardBody>

        <div className="border-t border-slate-200" />
        <CardHeader title="Forecast & display" className="pt-5" />
        <CardBody className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Forecast length" error={preset === "custom" ? undefined : errors.forecastDays} testId="settings-forecast-preset">
              <Select
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  if (e.target.value !== "custom") setForecastDays(e.target.value);
                }}
                data-testid="settings-forecast-preset"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days (3 months)</option>
                <option value="180">180 days (6 months)</option>
                <option value="365">365 days (12 months)</option>
                <option value="custom">Custom…</option>
              </Select>
            </Field>
            {preset === "custom" && (
              <Field
                label="Custom length (days)"
                hint={`${MIN_FORECAST_DAYS}–${MAX_FORECAST_DAYS} days`}
                error={errors.forecastDays}
                testId="settings-forecast-days"
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_FORECAST_DAYS}
                  max={MAX_FORECAST_DAYS}
                  step={1}
                  value={forecastDays}
                  onChange={(e) => setForecastDays(e.target.value)}
                  data-testid="settings-forecast-days"
                />
              </Field>
            )}
            <Field label="Currency" hint="Display only; no conversion." error={errors.currency} testId="settings-currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="settings-currency">
                {currencyOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Week starts on" error={errors.weekStartsOn} testId="settings-week-start">
              <Select value={weekStartsOn} onChange={(e) => setWeekStartsOn(e.target.value)} data-testid="settings-week-start">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
              </Select>
            </Field>
            <Field label="Default calendar view" error={errors.defaultCalendarView} testId="settings-default-view">
              <Select
                value={view}
                onChange={(e) => setView(e.target.value as SettingsDTO["defaultCalendarView"])}
                data-testid="settings-default-view"
              >
                <option value="month">Month</option>
                <option value="week">Week</option>
              </Select>
            </Field>
          </div>
        </CardBody>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between rounded-b-sheet">
          <div className="min-h-[1.5rem]" aria-live="polite">
            {status && <InlineStatus tone={status.tone}>{status.text}</InlineStatus>}
          </div>
          <Button type="submit" variant="primary" loading={saving} data-testid="settings-save">
            Save settings
          </Button>
        </div>
      </Card>
    </form>
  );
}
