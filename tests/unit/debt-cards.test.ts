import { describe, expect, it } from "vitest";
import type { BankAccountDTO, InstitutionDTO } from "@/contracts/api";
import { toDebtAccounts } from "@/domain/debt-cards";
import { planDebtPayoff } from "@/domain/debt-payoff";

const account = (over: Partial<BankAccountDTO>): BankAccountDTO => ({
  id: "conn1:a",
  name: "Account",
  institutionName: "Demo Bank",
  kind: "CREDIT",
  currency: "USD",
  balanceCents: 0,
  availableBalanceCents: null,
  balanceDate: "2026-10-23",
  statementClosingDay: null,
  paymentDueDay: null,
  aprBasisPoints: null,
  minimumPaymentRule: null,
  minimumPaymentCents: null,
  ...over,
});

const institution = (accounts: BankAccountDTO[]): InstitutionDTO => ({
  id: "conn1",
  name: "Demo Bank",
  connectedAt: "2026-10-01T10:00:00.000Z",
  lastSyncedAt: null,
  accounts,
});

describe("toDebtAccounts", () => {
  it("lists credit and loan accounts only", () => {
    const debts = toDebtAccounts([
      institution([
        account({ id: "bank", kind: "BANK", balanceCents: 500000 }),
        account({ id: "card", kind: "CREDIT", balanceCents: -120000 }),
        account({ id: "loan", kind: "LOAN", balanceCents: -900000 }),
        account({ id: "other", kind: "OTHER", balanceCents: -5 }),
      ]),
    ]);
    expect(debts.map((d) => [d.id, d.kind])).toEqual([
      ["card", "CREDIT"],
      ["loan", "LOAN"],
    ]);
  });

  it("treats a balance as what is owed whichever sign the bank reports", () => {
    const debts = toDebtAccounts([
      institution([
        account({ id: "neg", kind: "LOAN", balanceCents: -1500000 }),
        account({ id: "pos", kind: "LOAN", balanceCents: 1500000 }),
      ]),
    ]);
    expect(debts.map((d) => d.balanceCents)).toEqual([1500000, 1500000]);
  });

  it("passes the stored APR and minimum payment through, and keeps the connection id for saving", () => {
    const [debt] = toDebtAccounts([institution([account({ kind: "LOAN", balanceCents: -100000, aprBasisPoints: 549, minimumPaymentCents: 42000 })])]);
    expect(debt).toMatchObject({ institutionId: "conn1", aprBasisPoints: 549, minimumPaymentCents: 42000 });
  });

  it("feeds the planner: a loan with a stored payment is planned with that payment, not the estimate", () => {
    const accounts = [account({ id: "loan", kind: "LOAN", balanceCents: -1000000, aprBasisPoints: 600, minimumPaymentCents: 40000 })];
    const stored = planDebtPayoff(toDebtAccounts([institution(accounts)]), 60000, "avalanche");
    const estimated = planDebtPayoff(toDebtAccounts([institution([{ ...accounts[0], minimumPaymentCents: null }])]), 60000, "avalanche");
    expect(stored[0].cards[0].minimumPaymentCents).toBe(40000);
    expect(estimated[0].cards[0].minimumPaymentCents).toBe(20100); // 2% of $10,050 (balance plus a month of interest)
    expect(stored.cards[0].id).toBe("loan");
  });
});
