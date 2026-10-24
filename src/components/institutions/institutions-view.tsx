"use client";

import { Landmark, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { InstitutionDTO, InstitutionsConfigDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const CONNECT_SCRIPT = "https://cdn.teller.io/connect/connect.js";

interface TellerConnectSuccess {
  accessToken: string;
  enrollment: { id: string; institution: { name: string } };
}

interface TellerConnectHandle {
  open(): void;
}

declare global {
  interface Window {
    TellerConnect?: {
      setup(options: {
        applicationId: string;
        environment: string;
        products: string[];
        onSuccess: (auth: TellerConnectSuccess) => void;
        onFailure?: (failure: { message?: string }) => void;
      }): TellerConnectHandle;
    };
  }
}

function loadConnectScript(): Promise<void> {
  if (window.TellerConnect) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CONNECT_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Teller Connect. Check your internet connection.")), { once: true });
    if (!existing) {
      script.src = CONNECT_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function InstitutionsView() {
  const toast = useToast();
  const config = useApi<InstitutionsConfigDTO>("institutions-config", api.getInstitutionsConfig);
  const list = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const [removing, setRemoving] = useState<InstitutionDTO | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const configured = config.data?.configured === true;
  const items = list.data ?? [];

  async function startConnect() {
    const cfg = config.data;
    if (!cfg?.configured || !cfg.applicationId || !cfg.environment) return;
    setConnectError(null);
    setConnecting(true);
    try {
      await loadConnectScript();
      const connect = window.TellerConnect?.setup({
        applicationId: cfg.applicationId,
        environment: cfg.environment,
        products: ["balance", "transactions"],
        // The access token is posted straight to our server and never kept in the browser.
        onSuccess: (auth) => {
          void (async () => {
            try {
              const saved = await api.connectInstitution({
                accessToken: auth.accessToken,
                enrollmentId: auth.enrollment.id,
                institutionName: auth.enrollment.institution.name,
              });
              toast(`Connected ${saved.name}.`, "success");
              await list.reload();
            } catch (err) {
              setConnectError(errorMessage(err));
            } finally {
              setConnecting(false);
            }
          })();
        },
        onFailure: (failure) => {
          if (failure.message) setConnectError(failure.message);
          setConnecting(false);
        },
      });
      if (!connect) throw new Error("Teller Connect did not load.");
      connect.open();
      // Closing the Connect window without finishing fires no callback we rely on, so allow another try.
      setConnecting(false);
    } catch (err) {
      setConnectError(errorMessage(err));
      setConnecting(false);
    }
  }

  const addButton = configured ? (
    <Button
      variant="primary"
      className="w-full sm:w-auto"
      onClick={() => void startConnect()}
      loading={connecting}
      data-testid="add-institution-button"
    >
      <Plus aria-hidden="true" data-icon="inline-start" /> Add institution
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Connect your bank read-only to see its transaction history. Nothing here changes your projection."
        actions={addButton}
      />

      {connectError && <ErrorState className="mb-4" title="Couldn't connect" message={connectError} />}

      {config.error && !config.data ? (
        <ErrorState message={config.error} onRetry={config.reload} />
      ) : config.loading || list.loading ? (
        <LoadingRegion label="Loading institutions">
          <Card className="flex flex-col gap-3 p-5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </Card>
        </LoadingRegion>
      ) : !configured && items.length === 0 ? (
        <NotConfigured />
      ) : list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No institutions connected"
          description="Add your bank to see its recent transactions here. You sign in through Teller, and this app only gets read access."
          action={addButton}
          testId="institutions-empty"
        />
      ) : (
        <>
          {!configured && <NotConfigured className="mb-4" />}
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="institutions-list">
            {items.map((inst) => (
              <li key={inst.id} className="min-w-0">
                <InstitutionCard institution={inst} onRemove={setRemoving} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove institution?"
        confirmLabel="Remove"
        testId="confirm-remove-institution"
        description={
          <span className="block">
            <strong className="font-semibold text-foreground">{removing?.name}</strong> will be disconnected. Access is revoked at Teller
            and removed from this app. Your bank account itself is not affected. You can add it again later.
          </span>
        }
        onConfirm={async () => {
          if (!removing) return;
          const name = removing.name;
          await api.removeInstitution(removing.id);
          toast(`Removed “${name}”.`, "success");
          await list.reload();
        }}
        onError={(message) => toast(message, "error")}
      />
    </>
  );
}

function InstitutionCard({ institution, onRemove }: { institution: InstitutionDTO; onRemove: (i: InstitutionDTO) => void }) {
  return (
    <Card className="p-5" data-testid={`institution-card-${institution.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semiwide truncate text-base font-bold text-foreground">
            <Link
              href={`/institutions/${encodeURIComponent(institution.id)}`}
              className="rounded-control hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              data-testid={`institution-link-${institution.id}`}
            >
              {institution.name}
            </Link>
          </h2>
          <p className="text-xs text-muted-foreground">Connected {fmtShort(institution.connectedAt.slice(0, 10))}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onRemove(institution)}
          aria-label={`Remove ${institution.name}`}
          data-testid={`remove-institution-${institution.id}`}
        >
          <Trash aria-hidden="true" data-icon="inline-start" />
          Remove
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-border border-t border-border text-sm">
        {institution.accounts.length === 0 && <li className="py-2 text-muted-foreground">No accounts were shared.</li>}
        {institution.accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate text-foreground">
              {a.name} <span className="text-muted-foreground tabular-nums">••{a.lastFour}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Badge>{a.subtype.replace(/_/g, " ")}</Badge>
              {a.status !== "open" && <Badge tone="warning">{a.status}</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NotConfigured({ className }: { className?: string }) {
  return (
    <Card className={className} data-testid="institutions-not-configured">
      <div className="flex flex-col gap-3 p-5 text-sm text-foreground">
        <h2 className="font-semiwide text-base font-bold text-foreground">Set up Teller to connect a bank</h2>
        <p>Bank connections go through Teller. The settings live in a file, not on this page:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create a free developer account at teller.io and copy your Application ID.</li>
          <li>Download the certificate and private key. Keep them outside this project and never commit them.</li>
          <li>
            Set <code>TELLER_APPLICATION_ID</code>, <code>TELLER_ENVIRONMENT</code> (<code>sandbox</code>, <code>development</code> or{" "}
            <code>production</code>), <code>TELLER_CERT_PATH</code> and <code>TELLER_KEY_PATH</code> in <code>.env</code>. In the desktop
            app, put the same values in <code>teller.json</code> in the app&apos;s data folder (<code>%APPDATA%\CashFlow Planner</code>).
          </li>
          <li>Restart the app. Try <code>sandbox</code> first (fake banks), then <code>development</code> for real banks.</li>
        </ol>
      </div>
    </Card>
  );
}
