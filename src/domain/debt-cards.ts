/**
 * The accounts the Debt payoff page plans around (issue #104): credit cards and loans,
 * as the user labelled them (CONVENTIONS section 3). Pure; the page owns the fetching.
 */
import type { InstitutionDTO } from "../contracts/api";

export type DebtKind = "CREDIT" | "LOAN";

export interface DebtAccount {
  id: string;
  institutionId: string;
  name: string;
  kind: DebtKind;
  /** What is owed, always >= 0. */
  balanceCents: number;
  /** null = no APR stored; the planner treats it as 0%. */
  aprBasisPoints: number | null;
  /** null = no real minimum stored; the planner estimates one. */
  minimumPaymentCents: number | null;
}

/**
 * SimpleFIN reports a debt as a negative balance for most issuers but a positive one for some
 * loans, so the sign is dropped: a balance is what is owed either way.
 */
export function toDebtAccounts(institutions: readonly InstitutionDTO[]): DebtAccount[] {
  return institutions.flatMap((inst) =>
    inst.accounts.flatMap((a) =>
      a.kind === "CREDIT" || a.kind === "LOAN"
        ? [
            {
              id: a.id,
              institutionId: inst.id,
              name: a.name,
              kind: a.kind,
              balanceCents: Math.abs(a.balanceCents),
              aprBasisPoints: a.aprBasisPoints,
              minimumPaymentCents: a.minimumPaymentCents,
            },
          ]
        : [],
    ),
  );
}
