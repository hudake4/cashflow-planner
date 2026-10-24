"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BankTransactionDTO, InstitutionDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { EventAmount } from "@/components/ui/money";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";

function Amount({ tx, currency }: { tx: BankTransactionDTO; currency: string }) {
  // Money in is green, money out is red (see EventAmount); the sign is already normalized by the server.
  return <EventAmount kind={tx.amountCents >= 0 ? "INCOME" : "BILL"} amountCents={Math.abs(tx.amountCents)} currency={currency} />;
}

export function TransactionHistory({ institutionId }: { institutionId: string }) {
  const institution = useApi<InstitutionDTO>(`institution:${institutionId}`, () => api.getInstitution(institutionId));
  const [accountId, setAccountId] = useState<string | null>(null);

  const accounts = institution.data?.accounts ?? [];
  const activeAccountId = accountId ?? accounts[0]?.id ?? null;
  const account = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <>
      <Link
        href="/institutions"
        className="mb-3 inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-slate-600 hover:text-slate-900"
        data-testid="institution-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All institutions
      </Link>
      <PageHeader
        title={institution.data?.name ?? "Institution"}
        description="Recent transactions, fetched live from your bank through Teller. Nothing is saved in this app."
        actions={
          accounts.length > 1 ? (
            <Select
              aria-label="Account"
              value={activeAccountId ?? ""}
              onChange={(e) => setAccountId(e.target.value)}
              data-testid="account-picker"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ••{a.lastFour}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {institution.error && !institution.data ? (
        <ErrorState message={institution.error} onRetry={institution.reload} />
      ) : !institution.data ? (
        <LoadingRegion label="Loading institution">
          <Card className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Card>
        </LoadingRegion>
      ) : !account ? (
        <EmptyState title="No accounts" description="This institution didn't share any accounts." testId="transactions-no-accounts" />
      ) : (
        <Transactions key={account.id} institutionId={institutionId} accountId={account.id} currency={account.currency} />
      )}
    </>
  );
}

function Transactions({ institutionId, accountId, currency }: { institutionId: string; accountId: string; currency: string }) {
  const [rows, setRows] = useState<BankTransactionDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (fromId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.listBankTransactions(institutionId, { accountId, fromId });
        setRows((prev) => (fromId ? [...prev, ...page.transactions] : page.transactions));
        setHasMore(page.hasMore);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [institutionId, accountId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (error && rows.length === 0) return <ErrorState title="Couldn't load transactions" message={error} onRetry={() => void load()} />;
  if (loading && rows.length === 0) {
    return (
      <LoadingRegion label="Loading transactions">
        <Card className="space-y-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      </LoadingRegion>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="No transactions" description="The bank returned no transactions for this account." testId="transactions-empty" />;
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="transactions-table">
          <caption className="sr-only">Transactions</caption>
          <thead className="border-b border-slate-300 bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Description</th>
              <th scope="col" className="hidden px-4 py-3 sm:table-cell">Category</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((tx) => (
              <tr key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                <td className="px-4 py-3 whitespace-nowrap">{fmtShort(tx.date)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">{tx.counterparty ?? tx.description}</span>
                  {tx.pending && (
                    <Badge tone="warning" className="ml-2">
                      Pending
                    </Badge>
                  )}
                  {tx.counterparty && tx.counterparty !== tx.description && (
                    <div className="max-w-[28rem] truncate text-xs text-slate-600" title={tx.description}>
                      {tx.description}
                    </div>
                  )}
                </td>
                <td className="hidden px-4 py-3 capitalize sm:table-cell">{tx.category?.replace(/_/g, " ") ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Amount tx={tx} currency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {error && <ErrorState className="mt-4" title="Couldn't load more" message={error} />}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button loading={loading} onClick={() => void load(rows[rows.length - 1].id)} data-testid="load-older">
            Load older
          </Button>
        </div>
      )}
    </>
  );
}
