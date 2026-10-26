"use client";

import { ArrowLeftRight, ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { SpendingCategory, SpendingPeriodDTO, SpendingTransactionDTO } from "@/contracts/api";
import { fmtDate, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Balance } from "@/components/ui/money";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "./categories";

/** "Oct 1 â€“ Oct 24" (a period never crosses a year, so the year is left off). */
function periodLabel(from: string, to: string): string {
  return from === to ? fmtDate(from, "MMM d") : `${fmtDate(from, "MMM d")} â€“ ${fmtDate(to, "MMM d")}`;
}

/** Share of the period total, rounded; a nonzero amount never reads as 0%. */
function percentLabel(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  const pct = Math.round((part / total) * 100);
  return pct === 0 ? "<1%" : `${pct}%`;
}

const SOURCE_NOTES = { AUTO: null, MERCHANT: "Learned", MANUAL: "Set by you" } as const;

/** One transaction with a way to change its category. The category badge is left off where the category is already known. */
function TransactionRow({
  transaction: t,
  currency,
  onEdit,
  showCategory,
  testId,
}: {
  transaction: SpendingTransactionDTO;
  currency: string;
  onEdit: (transaction: SpendingTransactionDTO) => void;
  showCategory: boolean;
  testId: string;
}) {
  const note = SOURCE_NOTES[t.source];
  return (
    <li className="flex items-center justify-between gap-3 py-2.5" data-testid={testId}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground" title={t.description}>
          {t.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {fmtShort(t.date)}
          {showCategory && <Badge tone="neutral">{CATEGORY_LABELS[t.category]}</Badge>}
          {note && <span>{note}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">{money(t.cents, currency)}</span>
        <Button size="sm" onClick={() => onEdit(t)} aria-label={`Change category of ${t.name}, ${fmtShort(t.date)}`} data-testid="spending-transaction-edit">
          Change
        </Button>
      </div>
    </li>
  );
}

/** Every transaction of the period, collapsed until asked for, each with a way to change its category. */
function TransactionList({
  id,
  transactions,
  currency,
  onEdit,
}: {
  id: string;
  transactions: SpendingTransactionDTO[];
  currency: string;
  onEdit: (transaction: SpendingTransactionDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        data-testid={`spending-transactions-toggle-${id}`}
      >
        <Chevron className="size-4" aria-hidden="true" />
        Review categories ({transactions.length})
      </button>
      {open && (
        <ul id={listId} className="mt-1 divide-y divide-border" data-testid={`spending-transactions-${id}`}>
          {transactions.map((t) => (
            <TransactionRow key={t.id} transaction={t} currency={currency} onEdit={onEdit} showCategory testId="spending-transaction-row" />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One month of spending: total, an optional comparison line, the category breakdown, top merchants
 * and the transfers note, plus the transaction list for fixing categories. It only displays what the API returned.
 */
export function PeriodPanel({
  id,
  title,
  period,
  currency,
  comparison,
  onEditTransaction,
}: {
  /** "this-month" or "last-month": suffixes the test ids. */
  id: string;
  title: string;
  period: SpendingPeriodDTO;
  currency: string;
  comparison?: ReactNode;
  onEditTransaction: (transaction: SpendingTransactionDTO) => void;
}) {
  const headingId = `spending-${id}-heading`;
  const categoriesId = useId();
  // Categories expanded to show their transactions. Kept here so a change that refreshes the data leaves them open.
  const [openCategories, setOpenCategories] = useState<ReadonlySet<string>>(new Set());
  const toggleCategory = (category: string) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  // The API keeps TRANSFERS out of `categories` and `totalCents`; it gets its own row, sorted in by amount,
  // so a big card payment is visible without being counted as spending.
  const spending = period.categories.filter((c) => c.category !== "TRANSFERS");
  const transferCount = period.transactions.filter((t) => t.category === "TRANSFERS").length;
  const rows: { category: SpendingCategory; totalCents: number; transactionCount: number }[] =
    period.transfersCents > 0
      ? [...spending, { category: "TRANSFERS" as const, totalCents: period.transfersCents, transactionCount: transferCount }].sort(
          (a, b) => b.totalCents - a.totalCents,
        )
      : spending;

  return (
    <Card className="min-w-0" data-testid={`spending-period-${id}`}>
      <CardBody>
        <section aria-labelledby={headingId} className="flex flex-col gap-6">
          <div>
            <h2 id={headingId} className="font-semiwide text-base font-bold text-foreground">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{periodLabel(period.from, period.to)}</p>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">Total spent</p>
            <div>
              <Balance
                cents={period.totalCents}
                currency={currency}
                testId={`spending-total-${id}`}
                className="font-wide text-4xl leading-tight font-extrabold tracking-[-0.02em] text-foreground"
              />
            </div>
            {comparison}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending in this period.</p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-foreground">By category</h3>
                <ul className="mt-3 flex flex-col gap-4">
                  {rows.map((c) => {
                    const Icon = CATEGORY_ICONS[c.category];
                    const isTransfers = c.category === "TRANSFERS";
                    const share = period.totalCents > 0 ? Math.min(100, (c.totalCents / period.totalCents) * 100) : isTransfers ? 100 : 0;
                    const open = openCategories.has(c.category);
                    const Chevron = open ? ChevronDown : ChevronRight;
                    const panelId = `${categoriesId}-${c.category}`;
                    const inCategory = period.transactions.filter((t) => t.category === c.category);
                    return (
                      <li key={c.category} data-testid="spending-category-row">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => toggleCategory(c.category)}
                          className="block min-h-11 w-full rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          data-testid="spending-category-toggle"
                        >
                          <span className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                              <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="truncate">{CATEGORY_LABELS[c.category]}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-foreground">
                              <span className="font-semibold">{money(c.totalCents, currency)}</span>
                              <span className="ml-2 text-muted-foreground">{isTransfers ? "not in total" : percentLabel(c.totalCents, period.totalCents)}</span>
                            </span>
                          </span>
                          {/* The label, amount and percent above carry the data; the bar is a visual aid. */}
                          <span className="mt-1.5 block h-2 overflow-hidden rounded-chip bg-slate-200" aria-hidden="true">
                            <span className={isTransfers ? "block h-full rounded-chip bg-slate-400" : "block h-full rounded-chip bg-brand-600"} style={{ width: `${share}%` }} />
                          </span>
                        </button>
                        {open && (
                          <ul id={panelId} className="mt-1 ml-6 divide-y divide-border" data-testid="spending-category-transactions">
                            {inCategory.length === 0 ? (
                              <li className="py-2.5 text-sm text-muted-foreground">No transactions to show.</li>
                            ) : (
                              inCategory.map((t) => (
                                <TransactionRow
                                  key={t.id}
                                  transaction={t}
                                  currency={currency}
                                  onEdit={onEditTransaction}
                                  showCategory={false}
                                  testId="spending-category-transaction-row"
                                />
                              ))
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {period.topMerchants.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Top merchants</h3>
                  <ul className="mt-2 divide-y divide-border">
                    {period.topMerchants.map((m) => (
                      <li
                        key={`${m.name}:${m.category}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                        data-testid="spending-merchant-row"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground" title={m.name}>
                            {m.name}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <Badge tone="neutral">{CATEGORY_LABELS[m.category]}</Badge>
                            {m.transactionCount} {m.transactionCount === 1 ? "transaction" : "transactions"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{money(m.totalCents, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {period.transactions.length > 0 && (
            <TransactionList id={id} transactions={period.transactions} currency={currency} onEdit={onEditTransaction} />
          )}

          {period.transfersCents > 0 && (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground" data-testid={`spending-transfers-${id}`}>
              <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Transfers and card payments aren&apos;t counted in Total spent or the percentages.
            </p>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
