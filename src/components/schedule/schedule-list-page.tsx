"use client";

import { HandCoins, Pencil, Plus, Receipt, Trash } from "lucide-react";
import { useState } from "react";
import type { BillDTO, IncomeDTO, SettingsDTO } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { FREQUENCY_LABELS, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/app-shell";
import { ScheduleFormDialog, type ScheduleKind } from "@/components/forms/schedule-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Item = BillDTO | IncomeDTO;

const COPY = {
  bill: {
    title: "Bills",
    description: "Everything scheduled to leave your account: rent, utilities, subscriptions and one-off expenses.",
    add: "Add bill",
    emptyTitle: "No bills yet",
    emptyText: "Add your first bill, like rent or a phone plan, to see how it affects your weekly balance.",
    dateLabel: "First due",
    noun: "bill",
  },
  income: {
    title: "Income",
    description: "Paychecks and other money you expect to receive, on the actual payday.",
    add: "Add income",
    emptyTitle: "No income yet",
    emptyText: "Add your first paycheck so the calendar can project what you'll have left each week.",
    dateLabel: "First payday",
    noun: "income source",
  },
} as const;

export function ScheduleListPage({ kind }: { kind: ScheduleKind }) {
  const copy = COPY[kind];
  const toast = useToast();
  const list = useApi<Item[]>(kind, () => (kind === "bill" ? api.listBills() : api.listIncome()));
  const settings = useApi<SettingsDTO>("settings", api.getSettings);
  const currency = settings.data?.currency ?? "USD";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: Item) => {
    setEditing(item);
    setFormOpen(true);
  };

  const addButton = (
    <Button variant="primary" onClick={openAdd} data-testid={`add-${kind}-button`}>
      <Plus className="h-4 w-4" aria-hidden="true" /> {copy.add}
    </Button>
  );

  const items = list.data ?? [];
  const Icon = kind === "bill" ? Receipt : HandCoins;

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} actions={items.length > 0 ? addButton : undefined} />

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <LoadingRegion label={`Loading ${copy.title.toLowerCase()}`}>
          <Card className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </Card>
        </LoadingRegion>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon className="h-6 w-6" />}
          title={copy.emptyTitle}
          description={copy.emptyText}
          action={addButton}
          testId={`${kind}-empty`}
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm" data-testid={`${kind}-table`}>
              <caption className="sr-only">{copy.title}</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                  <th scope="col" className="px-4 py-3">Frequency</th>
                  <th scope="col" className="px-4 py-3">{copy.dateLabel}</th>
                  <th scope="col" className="px-4 py-3">Ends</th>
                  {kind === "bill" && <th scope="col" className="px-4 py-3">Category</th>}
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id} data-testid={`${kind}-row-${item.id}`} className={item.active ? "" : "bg-slate-50/60 text-slate-500"}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.notes && <div className="max-w-[16rem] truncate text-xs text-slate-600" title={item.notes}>{item.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(item.amountCents, currency)}</td>
                    <td className="px-4 py-3">{FREQUENCY_LABELS[item.frequency]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtShort(item.anchorDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.frequency === "ONE_TIME" ? "—" : item.endDate ? fmtShort(item.endDate) : "No end"}
                    </td>
                    {kind === "bill" && <td className="px-4 py-3">{(item as BillDTO).category ?? "—"}</td>}
                    <td className="px-4 py-3">
                      <ActiveBadge active={item.active} />
                    </td>
                    <td className="px-4 py-3">
                      <RowActions item={item} kind={kind} onEdit={openEdit} onDelete={setDeleting} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden" data-testid={`${kind}-cards`}>
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <Card className="p-4" data-testid={`${kind}-card-${item.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-600">
                        {FREQUENCY_LABELS[item.frequency]}
                        {kind === "bill" && (item as BillDTO).category ? ` · ${(item as BillDTO).category}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-semibold whitespace-nowrap tabular-nums">{money(item.amountCents, currency)}</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">{copy.dateLabel}</dt>
                      <dd className="text-slate-800">{fmtShort(item.anchorDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Ends</dt>
                      <dd className="text-slate-800">
                        {item.frequency === "ONE_TIME" ? "—" : item.endDate ? fmtShort(item.endDate) : "No end"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <ActiveBadge active={item.active} />
                    <RowActions item={item} kind={kind} onEdit={openEdit} onDelete={setDeleting} suffix="-mobile" />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <ScheduleFormDialog
        kind={kind}
        open={formOpen}
        item={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void list.reload()}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${copy.noun}?`}
        confirmLabel="Delete"
        description={
          <p>
            <strong className="font-semibold text-slate-900">{deleting?.name}</strong> will be removed from your projection.
            {kind === "bill" && " Any paid or skipped marks for it are deleted too."} This can&apos;t be undone.
          </p>
        }
        onConfirm={async () => {
          if (!deleting) return;
          const name = deleting.name;
          if (kind === "bill") await api.deleteBill(deleting.id);
          else await api.deleteIncome(deleting.id);
          toast(`Deleted “${name}”.`);
          await list.reload();
        }}
      />
    </>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="positive">Active</Badge> : <Badge tone="neutral">Inactive</Badge>;
}

function RowActions({
  item,
  kind,
  onEdit,
  onDelete,
  suffix = "",
}: {
  suffix?: string;
  item: Item;
  kind: ScheduleKind;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`} data-testid={`edit-${kind}-${item.id}${suffix}`}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        <span className="hidden xl:inline">Edit</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-rose-700 hover:bg-rose-50"
        onClick={() => onDelete(item)}
        aria-label={`Delete ${item.name}`}
        data-testid={`delete-${kind}-${item.id}${suffix}`}
      >
        <Trash className="h-4 w-4" aria-hidden="true" />
        <span className="hidden xl:inline">Delete</span>
      </Button>
    </div>
  );
}
