"use client";

import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import type { ReviewComparisonDTO } from "@/contracts/api";
import { fmtDate } from "@/lib/dates";
import { money } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/card";
import { Balance } from "@/components/ui/money";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/components/spending/categories";

/** "Oct 1 – Oct 24" (a period never crosses a year boundary the reader cares about, so the year is left off). */
function periodLabel(from: string, to: string): string {
  return from === to ? fmtDate(from, "MMM d") : `${fmtDate(from, "MMM d")} – ${fmtDate(to, "MMM d")}`;
}

/** Direction in words and an icon, never color alone. */
function Change({ cents, currency }: { cents: number; currency: string }) {
  const Icon = cents > 0 ? ArrowUp : cents < 0 ? ArrowDown : Equal;
  const text = cents > 0 ? `Up ${money(cents, currency)}` : cents < 0 ? `Down ${money(-cents, currency)}` : "No change";
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}

function Stat({
  id,
  label,
  note,
  currentCents,
  likeForLikeCents,
  previousCents,
  noun,
  currency,
}: {
  id: string;
  label: string;
  /** A short line under the amount, e.g. how many bills were paid. */
  note?: string;
  currentCents: number;
  /** The previous period up to the same day. */
  likeForLikeCents: number;
  /** The previous period in full. */
  previousCents: number;
  noun: "week" | "month";
  currency: string;
}) {
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid={`review-stat-${id}`}>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <Balance
        cents={currentCents}
        currency={currency}
        testId={`review-${id}`}
        className="font-wide text-3xl leading-tight font-extrabold tracking-[-0.02em] text-foreground"
      />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <p className="mt-1.5 text-sm text-muted-foreground" data-testid={`review-${id}-compare`}>
        <Change cents={currentCents - likeForLikeCents} currency={currency} /> vs {money(likeForLikeCents, currency)} by this day last {noun}
        <span className="block text-xs">Last {noun} in full: {money(previousCents, currency)}</span>
      </p>
    </li>
  );
}

/** The current week or month against the previous one. It only displays what the API returned. */
export function ComparisonPanel({ noun, comparison, currency }: { noun: "week" | "month"; comparison: ReviewComparisonDTO; currency: string }) {
  const { current, previous, previousToDate, categories } = comparison;
  const title = `This ${noun}`;
  const headingId = `review-${noun}-heading`;
  const billsNote = current.billsCount === 1 ? "1 bill marked paid" : `${current.billsCount} bills marked paid`;

  return (
    <Card className="min-w-0" data-testid={`review-panel-${noun}`}>
      <CardBody>
        <section aria-labelledby={headingId} className="flex flex-col gap-6">
          <div>
            <h2 id={headingId} className="font-semiwide text-base font-bold text-foreground">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="review-period">
              {periodLabel(current.from, current.to)} · compared with {periodLabel(previous.from, previous.to)}
            </p>
          </div>

          <ul className="divide-y divide-border">
            <Stat id="income" label="Income" currentCents={current.incomeCents} likeForLikeCents={previousToDate.incomeCents} previousCents={previous.incomeCents} noun={noun} currency={currency} />
            <Stat
              id="bills"
              label="Bills paid"
              note={billsNote}
              currentCents={current.billsCents}
              likeForLikeCents={previousToDate.billsCents}
              previousCents={previous.billsCents}
              noun={noun}
              currency={currency}
            />
            <Stat id="spending" label="Spending" currentCents={current.spendingCents} likeForLikeCents={previousToDate.spendingCents} previousCents={previous.spendingCents} noun={noun} currency={currency} />
            <Stat
              id="net"
              label="Income minus spending"
              currentCents={current.netCents}
              likeForLikeCents={previousToDate.netCents}
              previousCents={previous.netCents}
              noun={noun}
              currency={currency}
            />
          </ul>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Spending by category</h3>
            {categories.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="review-no-categories">
                No spending in this {noun} or the last one.
              </p>
            ) : (
              <table className="mt-2 w-full text-sm" data-testid="review-categories">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1.5 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      This {noun}
                    </th>
                    <th scope="col" className="py-1.5 text-right font-medium">
                      Last {noun}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categories.map((c) => {
                    const Icon = CATEGORY_ICONS[c.category];
                    return (
                      <tr key={c.category} data-testid="review-category-row">
                        <th scope="row" className="py-2.5 text-left font-medium text-foreground">
                          <span className="flex items-center gap-2">
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {CATEGORY_LABELS[c.category]}
                          </span>
                        </th>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">{money(c.currentCents, currency)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{money(c.previousCents, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </CardBody>
    </Card>
  );
}
