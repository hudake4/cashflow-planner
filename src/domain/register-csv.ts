/**
 * CSV export of the calendar register (CONVENTIONS section 18). Pure: it turns a
 * `ProjectionResponse` into text and never recomputes a balance.
 */
import type { LedgerEvent, ProjectionResponse } from "../contracts/api";
import { FREQUENCY_LABELS } from "./frequency-labels";
import { centsToDecimalString } from "./money";

/** Lets Excel read the file as UTF-8 (names with accents or symbols). */
export const CSV_BOM = "﻿";

const TYPE_LABEL: Record<LedgerEvent["kind"], string> = { INCOME: "Income", BILL: "Bill" };

const STATUS_LABEL: Record<LedgerEvent["status"], string> = {
  SCHEDULED: "Scheduled",
  UPCOMING: "Upcoming",
  PAID: "Paid",
  SKIPPED: "Skipped",
};

/**
 * Text that a spreadsheet would run as a formula starts with `=`, `+`, `-`, `@`, `|` (a DDE
 * command), a tab or a line break (leading spaces are ignored by some programs, so look past
 * them). Prefixing a single quote makes it plain text. Only user-entered text goes through
 * this: the amounts are our own decimal strings, and a negative one must stay a number.
 */
export function neutralizeFormula(text: string): string {
  return /^\s*[=+\-@|\t\r\n]/.test(text) ? `'${text}` : text;
}

/** One RFC 4180 field: quoted when it holds a comma, a quote or a line break; quotes are doubled. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Joins rows of already-final cell text into CSV (CRLF line breaks, as RFC 4180 asks). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/**
 * The register as the calendar shows it, one row per event in ledger order. Amount is
 * signed like the register (income +, bills -, override applied); a skipped bill keeps
 * its amount but its status says it is not counted and the balance does not move.
 * Dates are YYYY-MM-DD and money is an exact decimal with no symbol (the currency is in
 * the headers), so a spreadsheet reads both as plain values.
 */
export function registerToCsv(projection: Pick<ProjectionResponse, "events" | "currency">): string {
  const { currency } = projection;
  const header = ["Date", "Name", "Type", "Category", "Frequency", "Status", `Amount (${currency})`, `Balance after (${currency})`];
  const rows = projection.events.map((e) => [
    e.date,
    neutralizeFormula(e.name),
    TYPE_LABEL[e.kind],
    neutralizeFormula(e.category ?? ""),
    FREQUENCY_LABELS[e.frequency],
    STATUS_LABEL[e.status],
    centsToDecimalString(e.kind === "INCOME" ? e.amountCents : -e.amountCents),
    centsToDecimalString(e.balanceAfterCents),
  ]);
  return CSV_BOM + toCsv([header, ...rows]);
}
