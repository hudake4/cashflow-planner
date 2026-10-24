"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DashboardResponse } from "@/contracts/api";
import { fmtDate, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { Balance } from "@/components/ui/money";
import { Expandable, ExpandableContent, ExpandableTrigger } from "@/components/ui/expandable";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Point = { date: string; balanceCents: number };

/** Projected end-of-day balance over the forecast window. Values are the API's `trend` as-is. */
export function TrendChart({ dashboard }: { dashboard: DashboardResponse }) {
  const { trend, totals, settings } = dashboard;
  const currency = settings.currency;
  const [showTable, setShowTable] = useState(false);

  if (trend.length === 0) return null;
  const first = trend[0];
  const last = trend[trend.length - 1];

  const compact = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  // Axis ticks only (display): cents -> whole units for a compact label.
  const tick = (cents: number) => compact.format(Math.round(cents / 100));

  const summary =
    `Projected balance goes from ${money(first.balanceCents, currency)} on ${fmtShort(first.date)} ` +
    `to ${money(last.balanceCents, currency)} on ${fmtShort(last.date)}. ` +
    `Lowest point: ${money(totals.lowestBalanceCents, currency)} on ${fmtShort(totals.lowestBalanceDate)}.` +
    (totals.firstNegativeDate ? ` It first drops below zero on ${fmtShort(totals.firstNegativeDate)}.` : " It stays at or above zero.");

  return (
    <figure className="space-y-3" data-testid="trend-chart">
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-slate-200)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => fmtDate(d, "MMM d")}
              tick={{ fontSize: 11, fill: "var(--color-slate-600)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-slate-300)" }}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={tick}
              tick={{ fontSize: 11, fill: "var(--color-slate-600)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickCount={5}
              allowDecimals={false}
            />
            <ReferenceLine
              y={0}
              ifOverflow="extendDomain"
              stroke="var(--color-rose-700)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: "Zero", position: "insideBottomRight", fill: "var(--color-rose-700)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-slate-400)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as Point | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-control border border-slate-200 bg-sheet px-3 py-2 text-xs shadow-[0_8px_24px_-10px_rgb(23_42_51/0.35)]">
                    <p className="text-slate-500">{fmtDate(p.date, "EEE, MMM d, yyyy")}</p>
                    <p className="font-semibold text-slate-900">
                      <Balance cents={p.balanceCents} currency={currency} />
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="stepAfter"
              dataKey="balanceCents"
              stroke="var(--color-brand-600)"
              strokeWidth={2}
              fill="url(#trendFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-sheet)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-slate-700" data-testid="trend-summary">
        {summary}
      </figcaption>
      <Expandable expanded={showTable} onToggle={() => setShowTable((open) => !open)} transitionDuration={0.18}>
        {({ isExpanded }) => (
          <>
            <ExpandableTrigger
              aria-label={`${isExpanded ? "Hide" : "Show"} projected balances as a table`}
              data-testid="trend-table-toggle"
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isExpanded ? "Hide" : "Show"} balances as a table
              {isExpanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </ExpandableTrigger>
            <ExpandableContent preset="fade">
              <div className="max-h-64 overflow-auto rounded-control border border-border">
                <Table className="w-full text-sm">
                  <TableCaption className="sr-only">Projected end-of-day balance by date</TableCaption>
                  <TableHeader className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <TableRow>
                      <TableHead scope="col">Date</TableHead>
                      <TableHead scope="col" className="text-right">End-of-day balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trend.map((p) => (
                      <TableRow key={p.date}>
                        <TableCell>{fmtDate(p.date, "EEE, MMM d")}</TableCell>
                        <TableCell className="text-right">
                          <Balance cents={p.balanceCents} currency={currency} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ExpandableContent>
          </>
        )}
      </Expandable>
    </figure>
  );
}
