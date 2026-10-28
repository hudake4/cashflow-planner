"use client";

import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Landmark, Plus, RefreshCw, Trash } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ACCOUNT_KINDS, connectInstitutionSchema, type AccountKind, type BankAccountDTO, type InstitutionDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort, todayLocal } from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { aprToInputText, parseAprInput } from "@/domain/apr";
import { parseIsoDate } from "@/domain/dates";
import { paymentDueDate, statementClosingDate } from "@/domain/card-bill";
import { Balance } from "@/components/ui/money";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const SIMPLEFIN_CREATE_URL = "https://bridge.simplefin.org/simplefin/create";

interface Notice {
  title: string;
  messages: string[];
}

export function InstitutionsView() {
  const addFocusTarget = useRef<HTMLButtonElement | null>(null);
  const toast = useToast();
  const list = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const [removing, setRemoving] = useState<InstitutionDTO | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const items = list.data ?? [];

  const addButton = (
    <Button ref={addFocusTarget} variant="primary" className="w-full sm:w-auto" onClick={() => setConnectOpen(true)} data-testid="add-institution-button">
      <Plus aria-hidden="true" data-icon="inline-start" /> Connect a bank
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Connect your bank read-only through SimpleFIN Bridge to see balances and transactions. Label each account: only bank accounts add up to your starting balance when Settings uses the sum of your accounts."
        actions={list.loading || list.data?.length === 0 ? undefined : addButton}
      />

      {notice && (
        <Alert role="status" className="mb-4 flex items-start gap-3 rounded-control border-border bg-muted p-4" data-testid="institutions-notice">
          <div className="min-w-0 flex-1">
            <AlertTitle className="font-semibold text-foreground">{notice.title}</AlertTitle>
            <AlertDescription className="mt-1 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                {notice.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </AlertDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)} data-testid="institutions-notice-dismiss">
            Dismiss
          </Button>
        </Alert>
      )}

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <LoadingRegion label="Loading institutions">
          <Card className="flex flex-col gap-3 p-5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </Card>
        </LoadingRegion>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No banks connected"
          description="Connect a bank through SimpleFIN Bridge (a paid service run by SimpleFIN) to see its balances and recent transactions here. This app only gets read access."
          action={addButton}
          testId="institutions-empty"
        />
      ) : (
        <ul className="flex flex-col gap-8" data-testid="institutions-list">
          {items.map((inst) => (
            <li key={inst.id} className="min-w-0">
              <InstitutionCard
                institution={inst}
                onRemove={setRemoving}
                onSynced={async (warnings) => {
                  if (warnings.length) setNotice({ title: `Notices for ${inst.name}`, messages: warnings });
                  await list.reload();
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <ConnectDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={async (saved) => {
          setConnectOpen(false);
          if (saved.warnings.length) setNotice({ title: `Notices for ${saved.name}`, messages: saved.warnings });
          else setNotice(null);
          toast(`Connected ${saved.name}.`, "success");
          await list.reload();
        }}
      />

      <ConfirmDialog
        fallbackFocusTarget={() => addFocusTarget.current}
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this connection?"
        confirmLabel="Remove"
        testId="confirm-remove-institution"
        description={
          <span className="block space-y-2">
            <span className="block">
              <strong className="font-semibold text-foreground">{removing?.name}</strong> and its stored balances and transactions will be
              removed from this app only. Your bank account itself is not affected.
            </span>
            <span className="block">
              SimpleFIN can&apos;t be told to revoke access from here. To fully revoke it, also disable the token in your SimpleFIN
              Bridge account. To connect again later you need a new setup token.
            </span>
          </span>
        }
        onConfirm={async () => {
          if (!removing) return;
          const name = removing.name;
          await api.removeInstitution(removing.id);
          toast(`Removed “${name}” from this app.`, "success");
          await list.reload();
        }}
        onError={(message) => toast(message, "error")}
      />
    </>
  );
}

function ConnectDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (saved: Awaited<ReturnType<typeof api.connectInstitution>>) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setToken("");
    setFieldError(null);
    setError(null);
    onClose();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = connectInstitutionSchema.safeParse({ setupToken: token });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Paste your SimpleFIN setup token");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      // The token goes straight to our server. It is single-use, so it is never kept in the browser.
      const saved = await api.connectInstitution(parsed.data);
      setBusy(false);
      setToken("");
      await onConnected(saved);
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Connect a bank"
      description="Banks are linked through SimpleFIN Bridge. Your bank login never goes through this app."
      testId="connect-dialog"
    >
      {open && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-busy={busy} data-testid="connect-form">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>
              Make an account at SimpleFIN Bridge, link your bank there, and create a <strong>Setup Token</strong>.{" "}
              <a
                href={SIMPLEFIN_CREATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2"
                data-testid="simplefin-link"
              >
                Create a setup token <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(opens in your browser)</span>
              </a>
            </li>
            <li>Paste the token below. It is shown only once and can only be used once.</li>
          </ol>
          {error && <InlineStatus tone="error">{error}</InlineStatus>}
          <Field label="Setup token" error={fieldError} testId="setup-token">
            <Textarea
              rows={3}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setFieldError(null);
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={2000}
              className="font-mono"
              placeholder="aHR0cHM6Ly9..."
              data-testid="setup-token"
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={close} disabled={busy} data-testid="connect-cancel">
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" type="submit" variant="primary" loading={busy} data-testid="connect-submit">
              Connect
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function lastSyncedText(institution: InstitutionDTO): string {
  if (!institution.lastSyncedAt) return "Not synced yet";
  return `Last synced ${formatDistanceToNow(new Date(institution.lastSyncedAt), { addSuffix: true })}`;
}

function InstitutionCard({
  institution,
  onRemove,
  onSynced,
}: {
  institution: InstitutionDTO;
  onRemove: (i: InstitutionDTO) => void;
  onSynced: (warnings: string[]) => Promise<void>;
}) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    setSyncing(true);
    try {
      const result = await api.syncInstitution(institution.id);
      toast(`Refreshed ${result.name}.`, "success");
      await onSynced(result.warnings);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section aria-label={institution.name} data-testid={`institution-card-${institution.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semiwide truncate text-base font-bold text-foreground">{institution.name}</h2>
          <p
            className="text-xs text-muted-foreground"
            title={institution.lastSyncedAt ? new Date(institution.lastSyncedAt).toLocaleString() : undefined}
            data-testid={`institution-synced-${institution.id}`}
          >
            {lastSyncedText(institution)} &middot; Connected {fmtShort(institution.connectedAt.slice(0, 10))}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => void refresh()}
            loading={syncing}
            aria-label={`Refresh ${institution.name}`}
            data-testid={`sync-institution-${institution.id}`}
          >
            {!syncing && <RefreshCw aria-hidden="true" data-icon="inline-start" />}
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(institution)}
            disabled={syncing}
            aria-label={`Remove ${institution.name}`}
            data-testid={`remove-institution-${institution.id}`}
          >
            <Trash aria-hidden="true" data-icon="inline-start" />
            Remove
          </Button>
        </div>
      </div>
      {institution.accounts.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No accounts yet. Press Refresh to load them from SimpleFIN.</p>
      )}
      <ul className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        {institution.accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            institutionId={institution.id}
            showInstitution={new Set(institution.accounts.map((x) => x.institutionName)).size > 1}
            onKindChanged={() => onSynced([])}
          />
        ))}
      </ul>
    </section>
  );
}

const KIND_LABELS: Record<AccountKind, string> = {
  BANK: "Bank account",
  CREDIT: "Credit card / line of credit",
  LOAN: "Loan",
  OTHER: "Other",
};

function AccountRow({
  account,
  institutionId,
  showInstitution,
  onKindChanged,
}: {
  account: BankAccountDTO;
  institutionId: string;
  showInstitution: boolean;
  onKindChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const closingDefault = account.statementClosingDay != null ? statementClosingDate(todayLocal(), account.statementClosingDay) : "";
  const dueDefault = account.paymentDueDay != null
    ? account.statementClosingDay != null
      ? paymentDueDate(closingDefault, account.paymentDueDay)
      : statementClosingDate(todayLocal(), account.paymentDueDay)
    : "";
  const [closingDate, setClosingDate] = useState<string>(closingDefault);
  const [dueDate, setDueDate] = useState<string>(dueDefault);
  const [apr, setApr] = useState<string>(aprToInputText(account.aprBasisPoints));
  const [aprError, setAprError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ closingDate: string; dueDate: string; projectedBillCents: number; minimumPaymentCents: number | null } | null>(null);

  async function changeKind(kind: AccountKind) {
    setSaving(true);
    try {
      await api.setAccountKind(institutionId, account.id, kind);
      await onKindChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveCardFields() {
    const parsedApr = parseAprInput(apr);
    if (!parsedApr.ok) {
      setAprError("Enter a rate like 19.99");
      return;
    }
    setAprError(null);
    setSaving(true);
    try {
      await api.setAccountCardFields(institutionId, account.id, {
        statementClosingDay: closingDate === closingDefault ? account.statementClosingDay : closingDate ? parseIsoDate(closingDate).day : null,
        paymentDueDay: dueDate === dueDefault ? account.paymentDueDay : dueDate ? parseIsoDate(dueDate).day : null,
        aprBasisPoints: parsedApr.basisPoints,
      });
      toast("Saved card details.", "success");
      await onKindChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function runEstimate() {
    setEstimating(true);
    try {
      const res = await api.estimateCardBill(institutionId, account.id);
      setEstimate({
        closingDate: res.closingDate,
        dueDate: res.dueDate,
        projectedBillCents: res.projectedBillCents,
        minimumPaymentCents: res.minimumPaymentCents,
      });
      toast("Estimated bill updated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setEstimating(false);
    }
  }

  // SimpleFIN sends 0 for cards and loans whose provider doesn't report available credit, so a zero there means "unknown", not "nothing left".
  const available = account.kind === "CREDIT" || account.kind === "LOAN" ? account.availableBalanceCents || null : account.availableBalanceCents;

  return (
    <li className="min-w-0" data-testid={`account-row-${account.id}`}>
      <Card className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/institutions/${encodeURIComponent(institutionId)}?account=${encodeURIComponent(account.id)}`}
              className="rounded-control font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              data-testid={`account-link-${account.id}`}
            >
              {account.name}
              <span className="sr-only"> transactions</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              {showInstitution && `${account.institutionName} \u00b7 `}As of {fmtShort(account.balanceDate)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Balance cents={account.balanceCents} currency={account.currency} className="font-semibold" />
            {available !== null && (
              <p className="text-xs text-muted-foreground">
                Available <Balance cents={available} currency={account.currency} className="font-normal" />
              </p>
            )}
          </div>
        </div>
        <div className="mt-auto">
          <Select
            value={account.kind}
            onChange={(e) => void changeKind(e.target.value as AccountKind)}
            disabled={saving}
            aria-label={`Account type for ${account.name}`}
            className="h-8 w-auto max-w-full py-0 text-sm"
            data-testid={`account-kind-${account.id}`}
          >
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          {account.kind !== "BANK" && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid={`account-excluded-${account.id}`}>
              Not counted in your starting balance
            </p>
          )}
        </div>
        {account.kind === "CREDIT" && (
          <div className="mt-3 space-y-2 border-t border-border pt-3" data-testid={`card-details-${account.id}`}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Closing date">
                <Input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="h-8 w-full px-2 text-sm"
                  data-testid={`card-closing-${account.id}`}
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-8 w-full px-2 text-sm"
                  data-testid={`card-due-${account.id}`}
                />
              </Field>
              <Field label="APR %" error={aprError} testId={`card-apr-${account.id}`}>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={apr}
                  onChange={(e) => { setApr(e.target.value); setAprError(null); }}
                  className="h-8 w-full px-2 text-sm"
                  data-testid={`card-apr-${account.id}`}
                />
              </Field>
              <div className="flex items-end">
                <Button size="sm" variant="secondary" onClick={() => void saveCardFields()} loading={saving} data-testid={`card-save-${account.id}`}>
                  Save
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void runEstimate()} loading={estimating} data-testid={`card-estimate-${account.id}`}>
                Estimate bill
              </Button>
              {estimate && (
                <p className="text-sm text-muted-foreground" data-testid={`card-estimate-result-${account.id}`}>
                  Est. bill <Balance cents={estimate.projectedBillCents} currency={account.currency} className="font-semibold" /> due {estimate.dueDate}
                  {estimate.minimumPaymentCents !== null && ` (min ${ (estimate.minimumPaymentCents / 100).toFixed(2) })`}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
