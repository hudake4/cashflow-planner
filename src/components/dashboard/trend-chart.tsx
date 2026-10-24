"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse } from "@/contracts/api";
import { fmtDate, fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { Balance } from "@/components/ui/money";

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
                <stop offset="0%" stopColor="#2f6fed" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2f6fed" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => fmtDate(d, "MMM d")}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={tick}
              tick={{ fontSize: 11, fill: "#64748b" }}
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
              stroke="#be123c"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: "Zero", position: "insideBottomRight", fill: "#be123c", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as Point | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
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
              stroke="#1f5ad6"
              strokeWidth={2}
              fill="url(#trendFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-slate-700" data-testid="trend-summary">
        {summary}
      </figcaption>
      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        aria-expanded={showTable}
        className="text-xs font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        {showTable ? "Hide" : "Show"} balances as a table
      </button>
      {showTable && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Projected end-of-day balance by date</caption>
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2 text-right">End-of-day balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trend.map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5">{fmtDate(p.date, "EEE, MMM d")}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Balance cents={p.balanceCents} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
