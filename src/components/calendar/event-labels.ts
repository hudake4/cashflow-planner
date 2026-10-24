import type { LedgerEvent } from "@/contracts/api";
import { fmtDayLong } from "@/lib/dates";
import { money, spokenKindMoney } from "@/lib/format";

function eventStatusText(event: LedgerEvent): string {
  if (event.status === "SKIPPED") return "Skipped";
  if (event.status === "PAID") return "Paid";
  return "";
}

/** Screen-reader text for one ledger event: name, kind, amount, date, status and the balance after it. */
export function eventAriaLabel(event: LedgerEvent, currency: string): string {
  const parts = [
    event.name,
    event.kind === "INCOME" ? "income" : "bill",
    spokenKindMoney(event.kind, event.amountCents, currency),
    `on ${fmtDayLong(event.date)}`,
  ];
  const status = eventStatusText(event);
  if (status) parts.push(status === "Skipped" ? "Skipped, not counted" : status);
  if (event.amountOverridden) parts.push("amount changed for this date");
  parts.push(`${event.balanceAfterCents < 0 ? "negative balance" : "balance"} after ${money(event.balanceAfterCents, currency)}`);
  return parts.join(", ");
}
