import type { SettingsDTO } from "../contracts/api";

type BalanceSettings = Pick<SettingsDTO, "startingBalanceCents" | "startingBalanceSource" | "accountsBalanceCents">;

/**
 * The balance the projection starts from (CONVENTIONS section 3). With the ACCOUNTS source it is
 * the sum of the connected bank accounts; the typed balance is the fallback while none are connected.
 */
export function effectiveStartingBalanceCents(s: BalanceSettings): number {
  return s.startingBalanceSource === "ACCOUNTS" && s.accountsBalanceCents !== null
    ? s.accountsBalanceCents
    : s.startingBalanceCents;
}
