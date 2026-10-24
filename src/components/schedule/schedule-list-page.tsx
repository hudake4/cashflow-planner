"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsUpDown,
  CircleAlert,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Trash,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { BillDTO, BillInput, IncomeDTO, IncomeInput, SettingsDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { FREQUENCY_LABELS, money } from "@/lib/format";
import { nextSort, sortScheduleItems, type SortKey, type SortState } from "@/lib/sort-schedule";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app-shell";
import { RecurringScanButton } from "@/components/recurring/recurring-scan";
import { ScheduleFormDialog, type ScheduleKind } from "@/components/forms/schedule-form-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";
import { Switch } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function itemInput(item: Item, active: boolean): BillInput | IncomeInput {
  if ("category" in item) {
    return {
      name: item.name,
      amountCents: item.amountCents,
      frequency: item.frequency,
      anchorDate: item.anchorDate,
      endDate: item.endDate,
      category: item.category,
      notes: item.notes,
      active,
    };
  }

  return {
    name: item.name,
    amountCents: item.amountCents,
    frequency: item.frequency,
    anchorDate: item.anchorDate,
    endDate: item.endDate,
    notes: item.notes,
    active,
  };
}

export function ScheduleListPage({ kind }: { kind: ScheduleKind }) {
  const copy = COPY[kind];
  const toast = useToast();
  const list = useApi<Item[]>(kind, () => (kind === "bill" ? api.listBills() : api.listIncome()));
  const settings = useApi<SettingsDTO>("settings", api.getSettings);
  const currency = settings.data?.currency ?? "USD";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const addFocusTarget = useRef<HTMLButtonElement | null>(null);
  const editFocusTarget = useRef<HTMLButtonElement | null>(null);
  const deleteFocusTarget = useRef<HTMLButtonElement | null>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: Item, trigger: HTMLButtonElement | null) => {
    editFocusTarget.current = trigger;
    setEditing(item);
    setFormOpen(true);
  };
  const openDelete = (item: Item, trigger: HTMLButtonElement | null) => {
    deleteFocusTarget.current = trigger;
    setDeleting(item);
  };

  const addButton = (
    <Button ref={addFocusTarget} variant="primary" className="w-full sm:w-auto" onClick={openAdd} data-testid={`add-${kind}-button`}>
      <Plus aria-hidden="true" data-icon="inline-start" /> {copy.add}
    </Button>
  );

  const scanButton = <RecurringScanButton onAdded={() => void list.reload()} className="w-full sm:w-auto" />;

  const [sort, setSort] = useState<SortState | null>(null);
  const items = useMemo(() => sortScheduleItems(list.data ?? [], sort), [list.data, sort]);
  const sortHeader = (key: SortKey, label: string, className?: string) => (
    <SortableHead
      label={label}
      direction={sort?.key === key ? sort.direction : null}
      onSort={() => setSort((current) => nextSort(current, key))}
      className={className}
      testId={`${kind}-sort-${key}`}
    />
  );
  const Icon = kind === "bill" ? Receipt : HandCoins;

  async function toggleActive(item: Item, active: boolean) {
    setPendingToggle(item.id);
    setActionError(null);
    try {
      if (kind === "bill") await api.updateBill(item.id, itemInput(item, active) as BillInput);
      else await api.updateIncome(item.id, itemInput(item, active) as IncomeInput);
      toast(`${item.name} is now ${active ? "active" : "inactive"}.`, "success");
      await list.reload();
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      toast(message, "error");
    } finally {
      setPendingToggle(null);
    }
  }

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {scanButton}
            {items.length > 0 && addButton}
          </div>
        }
      />

      {actionError && (
        <Alert variant="destructive" role="alert" className="mb-5 flex items-start gap-3">
          <CircleAlert aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <AlertTitle>Couldn&apos;t update {copy.noun}</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
            Dismiss
          </Button>
        </Alert>
      )}

      {list.error && list.data && <ErrorState message={list.error} onRetry={list.reload} className="mb-5" />}

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <LoadingRegion label={`Loading ${copy.title.toLowerCase()}`}>
          <Card className="flex flex-col gap-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
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
          <Card className="hidden overflow-hidden lg:block" aria-busy={list.refreshing || undefined}>
            <Table data-testid={`${kind}-table`} aria-label={`${copy.title} schedule`}>
              <TableCaption className="sr-only">{copy.title}</TableCaption>
              <TableHeader className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
                <TableRow>
                  {sortHeader("name", "Name")}
                  {sortHeader("amount", "Amount", "text-right")}
                  {sortHeader("frequency", "Frequency")}
                  {sortHeader("anchorDate", copy.dateLabel)}
                  {sortHeader("endDate", "Ends")}
                  {kind === "bill" && sortHeader("category", "Category")}
                  <TableHead className="px-4">Status</TableHead>
                  <TableHead className="relative w-12 px-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    data-testid={`${kind}-row-${item.id}`}
                    className={cn(!item.active && "bg-muted/40 text-muted-foreground")}
                  >
                    <TableCell className="min-w-52 whitespace-normal px-4">
                      <div className="font-semibold text-foreground">{item.name}</div>
                      {item.notes && (
                        <div className="mt-1 max-w-[22rem] truncate text-xs text-muted-foreground" title={item.notes}>
                          {item.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-semiwide px-4 text-right font-semibold tabular-nums text-foreground">
                      {money(item.amountCents, currency)}
                    </TableCell>
                    <TableCell className="px-4">{FREQUENCY_LABELS[item.frequency]}</TableCell>
                    <TableCell className="whitespace-nowrap px-4">{fmtShort(item.anchorDate)}</TableCell>
                    <TableCell className="whitespace-nowrap px-4">
                      {item.frequency === "ONE_TIME" ? "—" : item.endDate ? fmtShort(item.endDate) : "No end"}
                    </TableCell>
                    {kind === "bill" && <TableCell className="px-4">{(item as BillDTO).category ?? "—"}</TableCell>}
                    <TableCell className="px-4">
                      <ActiveControl
                        item={item}
                        kind={kind}
                        suffix=""
                        busy={pendingToggle === item.id}
                        onToggle={toggleActive}
                      />
                    </TableCell>
                    <TableCell className="px-4 text-right">
                        <RowActions item={item} kind={kind} onEdit={openEdit} onDelete={openDelete} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden"
            data-testid={`${kind}-cards`}
            aria-busy={list.refreshing || undefined}
          >
            {items.map((item) => {
              const hasDetails =
                item.frequency !== "ONE_TIME" || Boolean(item.notes) || (kind === "bill" && Boolean((item as BillDTO).category));
              return (
                <li key={item.id} className="min-w-0">
                  <Expandable className="h-full">
                    {({ isExpanded }) => (
                      <Card className="h-full p-4" data-testid={`${kind}-card-${item.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{FREQUENCY_LABELS[item.frequency]}</p>
                        </div>
                        <p className="font-semiwide shrink-0 text-right font-bold tabular-nums text-foreground">
                          {money(item.amountCents, currency)}
                        </p>
                      </div>

                      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
                        <DataPoint label={copy.dateLabel} value={fmtShort(item.anchorDate)} />
                      </dl>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                        <ActiveControl
                          item={item}
                          kind={kind}
                          suffix="-mobile"
                          busy={pendingToggle === item.id}
                          onToggle={toggleActive}
                        />
                        <RowActions item={item} kind={kind} onEdit={openEdit} onDelete={openDelete} suffix="-mobile" />
                      </div>

                      {hasDetails && (
                        <>
                          <ExpandableTrigger
                            className="mt-3 flex min-h-9 w-full items-center justify-between gap-2 border-t border-border pt-3 text-left text-sm font-semibold text-primary"
                            aria-label={isExpanded ? `Hide details for ${item.name}` : `Show details for ${item.name}`}
                          >
                            <span>{isExpanded ? "Hide details" : "Show details"}</span>
                            <ChevronDown
                              className={cn("size-4 transition-transform duration-150", isExpanded && "rotate-180")}
                              aria-hidden="true"
                            />
                          </ExpandableTrigger>
                          <ExpandableContent preset="slide-down" className="text-sm">
                            <dl className="grid gap-2 border-t border-border pt-3 text-sm">
                              <DataPoint
                                label="Ends"
                                value={item.frequency === "ONE_TIME" ? "—" : item.endDate ? fmtShort(item.endDate) : "No end"}
                              />
                              {kind === "bill" && (
                                <DataPoint label="Category" value={(item as BillDTO).category ?? "Not set"} />
                              )}
                              {item.notes && <DataPoint label="Notes" value={item.notes} />}
                            </dl>
                          </ExpandableContent>
                        </>
                      )}
                    </Card>
                    )}
                  </Expandable>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ScheduleFormDialog
        kind={kind}
        restoreFocusTarget={() => editing ? editFocusTarget.current : addFocusTarget.current}
        fallbackFocusTarget={() => addFocusTarget.current}
        open={formOpen}
        item={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void list.reload()}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        restoreFocusTarget={() => deleteFocusTarget.current}
        fallbackFocusTarget={() => addFocusTarget.current}
        title={`Delete ${kind === "bill" ? "bill" : "income source"}?`}
        description={
          <span className="block">
            <strong className="font-semibold text-foreground">{deleting?.name}</strong> will be removed from your projection.
            {kind === "bill" && " Any paid or skipped marks for it are deleted too."} This can&apos;t be undone.
          </span>
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return;
          const name = deleting.name;
          if (kind === "bill") await api.deleteBill(deleting.id);
          else await api.deleteIncome(deleting.id);
          toast(`Deleted “${name}”.`, "success");
          await list.reload();
        }}
        onError={(message) => toast(message, "error")}
      />
    </>
  );
}

function SortableHead({
  label,
  direction,
  onSort,
  className,
  testId,
}: {
  label: string;
  direction: SortState["direction"] | null;
  onSort: () => void;
  className?: string;
  testId: string;
}) {
  const SortIcon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      className={cn("px-4", className)}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
    >
      <button
        type="button"
        onClick={onSort}
        data-testid={testId}
        className={cn(
          "-mx-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-semibold hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          direction && "text-foreground",
        )}
      >
        {label}
        <SortIcon className={cn("size-3.5", !direction && "opacity-50")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function DataPoint({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ActiveControl({
  item,
  kind,
  suffix,
  busy,
  onToggle,
}: {
  item: Item;
  kind: ScheduleKind;
  suffix: string;
  busy: boolean;
  onToggle: (item: Item, active: boolean) => void | Promise<void>;
}) {
  return (
    <div
      className={cn("min-w-0", busy && "pointer-events-none opacity-70")}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
    >
      <Switch
        checked={item.active}
        onChange={(active) => {
          if (!busy) void onToggle(item, active);
        }}
        label={item.active ? "Included" : "Paused"}
        description={busy ? "Saving…" : undefined}
        testId={`toggle-${kind}-${item.id}${suffix}`}
      />
    </div>
  );
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
  onEdit: (item: Item, trigger: HTMLButtonElement | null) => void;
  onDelete: (item: Item, trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          size="icon"
          variant="ghost"
          className="size-11 lg:size-9"
          aria-label={`Actions for ${item.name}`}
          data-testid={`actions-${kind}-${item.id}${suffix}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="truncate">{item.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-9"
          onSelect={() => onEdit(item, triggerRef.current)}
          data-testid={`edit-${kind}-${item.id}${suffix}`}
        >
          <Pencil aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-9"
          variant="destructive"
          onSelect={() => onDelete(item, triggerRef.current)}
          data-testid={`delete-${kind}-${item.id}${suffix}`}
        >
          <Trash aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
