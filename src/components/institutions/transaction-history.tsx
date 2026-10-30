"use client";

import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BankTransactionDTO, InstitutionDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";
import { LINK_TARGET_CLASS, revealLinkTarget, useLinkTarget } from "@/lib/use-link-target";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { LinkTargetMissing } from "@/components/ui/link-target-missing";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Bank amounts are signed (money in positive, out negative), so the sign is shown in text
 * and as an arrow; green marks money in, but color is never the only signal.
 */
function Amount({ cents, currency }: { cents: number; currency: string }) {
  const incoming = cents > 0;
  const Icon = incoming ? ArrowUp : cents < 0 ? ArrowDown : null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums", incoming ? "text-emerald-700" : "text-foreground")}>
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="sr-only">{incoming ? "Money in " : cents < 0 ? "Money out " : ""}</span>
      {signedMoney(cents, currency)}
    </span>
  );
}

const LINK_PARAMS = ["tx"] as const;
/** Stop paging through an account's history for a linked transaction after this many rows. */
const LINK_SEARCH_MAX_ROWS = 2000;

/** `transactionId` (`?tx=<id>`, from the command palette) marks that row of `initialAccountId`, loading more pages until it is shown. */
export function TransactionHistory({
  institutionId,
  initialAccountId,
  transactionId,
}: {
  institutionId: string;
  initialAccountId?: string;
  transactionId?: string;
}) {
  const list = useApi<InstitutionDTO[]>("institutions", api.listInstitutions);
  const [accountId, setAccountId] = useState<string | null>(initialAccountId ?? null);

  const [linkTarget, clearLinkTarget] = useLinkTarget(transactionId, LINK_PARAMS);
  const [linked, setLinked] = useState<{ accountId: string | null; transactionId: string } | null>(null);
  useEffect(() => {
    if (!linkTarget) return;
    clearLinkTarget();
    setLinked({ accountId: initialAccountId ?? null, transactionId: linkTarget });
    // A link to another account of this institution arrives without a remount.
    if (initialAccountId) setAccountId(initialAccountId);
  }, [linkTarget, clearLinkTarget, initialAccountId]);

  const institution = list.data?.find((i) => i.id === institutionId) ?? null;
  const accounts = institution?.accounts ?? [];
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;
  const linkedId = linked && account && (linked.accountId === null || linked.accountId === account.id) ? linked.transactionId : null;

  return (
    <>
      <Link
        href="/institutions"
        className="mb-3 inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-muted-foreground hover:text-foreground"
        data-testid="institution-back"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All institutions
      </Link>
      <PageHeader
        title={institution?.name ?? "Institution"}
        description={
          account
            ? `The last 89 days, saved on this computer from your last sync. Balance ${money(account.balanceCents, account.currency)} as of ${fmtShort(account.balanceDate)}.`
            : "The last 89 days, saved on this computer from your last sync."
        }
        actions={
          accounts.length > 1 ? (
            <Select aria-label="Account" value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)} data-testid="account-picker">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingRegion label="Loading institution">
          <Card className="flex flex-col gap-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Card>
        </LoadingRegion>
      ) : !institution ? (
        <EmptyState title="Connection not found" description="It may have been removed." testId="institution-not-found" />
      ) : !account ? (
        <EmptyState title="No accounts" description="SimpleFIN hasn't shared any accounts yet. Press Refresh on the Institutions page." testId="transactions-no-accounts" />
      ) : (
        <Transactions key={account.id} institutionId={institutionId} accountId={account.id} currency={account.currency} linkedId={linkedId} />
      )}
    </>
  );
}

function Transactions({
  institutionId,
  accountId,
  currency,
  linkedId,
}: {
  institutionId: string;
  accountId: string;
  currency: string;
  linkedId: string | null;
}) {
  const [rows, setRows] = useState<BankTransactionDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may change the list, so an older page arriving late can't duplicate or reset rows.
  const latestRequest = useRef(0);

  const load = useCallback(
    async (offset = 0) => {
      const request = ++latestRequest.current;
      setLoading(true);
      setError(null);
      try {
        const page = await api.listBankTransactions(institutionId, { accountId, offset });
        if (request !== latestRequest.current) return;
        setRows((prev) => (offset > 0 ? [...prev, ...page.transactions] : page.transactions));
        setHasMore(page.hasMore);
      } catch (err) {
        if (request === latestRequest.current) setError(errorMessage(err));
      } finally {
        if (request === latestRequest.current) setLoading(false);
      }
    },
    [institutionId, accountId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The list is paged newest first; keep loading until the linked row is in it or the history ends.
  const linkedLoaded = linkedId !== null && rows.some((r) => r.id === linkedId);
  const keepLooking = linkedId !== null && !linkedLoaded && hasMore && !error && rows.length < LINK_SEARCH_MAX_ROWS;
  useEffect(() => {
    if (keepLooking && !loading) void load(rows.length);
  }, [keepLooking, loading, load, rows.length]);
  const linkedMissing = linkedId !== null && !linkedLoaded && !keepLooking && !loading && !error;

  if (error && rows.length === 0) return <ErrorState title="Couldn't load transactions" message={error} onRetry={() => void load()} />;
  if (loading && rows.length === 0) {
    return (
      <LoadingRegion label="Loading transactions">
        <Card className="flex flex-col gap-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </LoadingRegion>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No transactions"
        description="No transactions were stored for this account in the last sync."
        testId="transactions-empty"
      />
    );
  }

  return (
    <>
      {linkedMissing && (
        <LinkTargetMissing>That transaction isn&apos;t in this account&apos;s stored history any more. The app keeps the last 89 days.</LinkTargetMissing>
      )}
      <Card className="overflow-hidden">
        <Table data-testid="transactions-table" aria-label="Transactions">
          <TableCaption className="sr-only">Transactions, newest first</TableCaption>
          <TableHeader className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
            <TableRow>
              <TableHead className="px-4">Date</TableHead>
              <TableHead className="px-4">Description</TableHead>
              <TableHead className="px-4 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tx) => (
              <TableRow
                key={tx.id}
                ref={tx.id === linkedId ? revealLinkTarget : undefined}
                tabIndex={tx.id === linkedId ? -1 : undefined}
                className={cn(tx.id === linkedId && LINK_TARGET_CLASS)}
                data-testid={`transaction-row-${tx.id}`}
                data-linked={tx.id === linkedId || undefined}
              >
                <TableCell className="whitespace-nowrap px-4">{fmtShort(tx.date)}</TableCell>
                <TableCell className="px-4 whitespace-normal break-words">
                  <span className="font-medium text-foreground">{tx.description}</span>
                  {tx.pending && (
                    <Badge tone="warning" className="ml-2">
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <Amount cents={tx.amountCents} currency={currency} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {error && <ErrorState className="mt-4" title="Couldn't load more" message={error} />}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button loading={loading} onClick={() => void load(rows.length)} data-testid="load-more">
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
