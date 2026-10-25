import type { SettingsDTO } from "../contracts/api";

type BalanceSettings = Pick<SettingsDTO, "startingBalanceCents" | "startingBalanceSource" | "accountsBalanceCents">;
type StartDateSettings = Pick<SettingsDTO, "projectionStartDate" | "startingBalanceSource" | "accountsBalanceDate">;

/**
 * The balance the projection starts from (CONVENTIONS section 3). With the ACCOUNTS source it is
 * the sum of the connected bank accounts; the typed balance is the fallback while none are connected.
 */
export function effectiveStartingBalanceCents(s: BalanceSettings): number {
  return s.startingBalanceSource === "ACCOUNTS" && s.accountsBalanceCents !== null
    ? s.accountsBalanceCents
    : s.startingBalanceCents;
}

/** True when the start date comes from the bank accounts rather than the typed `projectionStartDate`. */
export function startDateFromAccounts(s: Pick<StartDateSettings, "startingBalanceSource" | "accountsBalanceDate">): boolean {
  return s.startingBalanceSource === "ACCOUNTS" && s.accountsBalanceDate !== null;
}

/**
 * The date the projection starts on (CONVENTIONS section 3). The sum of the bank accounts is only
 * right from the least recent balance forward, so with the ACCOUNTS source it is the oldest
 * `balanceDate` among the summed accounts; otherwise the typed date. Everything the bank balance
 * already includes happened before it, so the engine must not replay it.
 */
export function effectiveProjectionStartDate(s: StartDateSettings): string {
  return startDateFromAccounts(s) && s.accountsBalanceDate !== null ? s.accountsBalanceDate : s.projectionStartDate;
}
