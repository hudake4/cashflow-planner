import { describe, expect, it } from "vitest";
import { planDebtPayoff, type DebtPayoffCardInput } from "@/domain/debt-payoff";

const card = (over: DebtPayoffCardInput): DebtPayoffCardInput => over;

describe("planDebtPayoff", () => {
  it("returns an empty, paid-off plan when there are no cards", () => {
    const plan = planDebtPayoff([], 5000, "snowball");
    expect(plan.monthsToPayoff).toBe(0);
    expect(plan.paidOff).toBe(true);
    expect(plan.payoffPossible).toBe(true);
    expect(plan.totalInterestCents).toBe(0);
  });

  it("ignores cards with a zero or negative balance", () => {
    const plan = planDebtPayoff(
      [card({ id: "zero", balanceCents: 0, aprBasisPoints: 2400 }), card({ id: "real", balanceCents: 5000, aprBasisPoints: 0, minimumPaymentCents: 0 })],
      5000,
      "snowball",
    );
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0].id).toBe("real");
  });

  it("snowball pays the lowest balance first and rolls the payment over (0% APR, no minimums)", () => {
    const plan = planDebtPayoff(
      [
        card({ id: "low", balanceCents: 5000, aprBasisPoints: 0, minimumPaymentCents: 0 }),
        card({ id: "high", balanceCents: 10000, aprBasisPoints: 0, minimumPaymentCents: 0 }),
      ],
      1000,
      "snowball",
    );
    // $50 cleared in 5 months, then $100 over the next 10 months.
    expect(plan.monthsToPayoff).toBe(15);
    expect(plan.totalInterestCents).toBe(0);
    expect(plan.totalPaidCents).toBe(15000);
    expect(plan.paidOff).toBe(true);
    // The lower-balance card is fully paid first.
    expect(plan[4].paidOffCards).toContain("low");
    expect(plan[14].paidOffCards).toContain("high");
  });

  it("avalanche pays the highest APR first and is cheaper than snowball", () => {
    const cards = [
      card({ id: "A", balanceCents: 1000, aprBasisPoints: 0, minimumPaymentCents: 0 }),
      card({ id: "B", balanceCents: 2000, aprBasisPoints: 2400, minimumPaymentCents: 0 }),
    ];
    const snowball = planDebtPayoff(cards, 1000, "snowball");
    const avalanche = planDebtPayoff(cards, 1000, "avalanche");

    expect(snowball.monthsToPayoff).toBe(4);
    expect(avalanche.monthsToPayoff).toBe(4);
    expect(snowball.totalInterestCents).toBe(105);
    expect(avalanche.totalInterestCents).toBe(62);
    expect(avalanche.totalInterestCents).toBeLessThan(snowball.totalInterestCents);
    expect(snowball.paidOff).toBe(true);
    expect(avalanche.paidOff).toBe(true);
    expect(avalanche.payoffPossible).toBe(true);
  });

  it("estimates the minimum payment at 2% of balance with a $25 floor", () => {
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 10000, aprBasisPoints: 0 })], 5000, "snowball");
    // $100 balance -> 2% is $2, floored to $25.00.
    expect(plan[0].cards[0].minimumPaymentCents).toBe(2500);
  });

  it("caps the estimated minimum at the full balance for small debts", () => {
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 1000, aprBasisPoints: 0 })], 10000, "snowball");
    // $10 balance -> 2% is $0.20, floored to $25 but capped at the balance.
    expect(plan[0].cards[0].minimumPaymentCents).toBe(1000);
    expect(plan.monthsToPayoff).toBe(1);
  });

  it("marks a zero budget as not payoff-able instead of projecting forever", () => {
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 10000, aprBasisPoints: 2400 })], 0, "snowball");
    expect(plan.payoffPossible).toBe(false);
    expect(plan.paidOff).toBe(false);
    expect(plan.monthsToPayoff).toBe(0);
    expect(plan.totalInterestCents).toBe(0);
  });

  it("marks a payment that only covers interest as not payoff-able", () => {
    // $100 at 24% APR accrues $2.00 in the first month; $1.00 can't shrink it.
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 10000, aprBasisPoints: 2400 })], 100, "snowball");
    expect(plan.payoffPossible).toBe(false);
    expect(plan.paidOff).toBe(false);
    expect(plan.monthsToPayoff).toBe(0);
  });

  it("keeps a 0% APR debt with a zero budget from looping the full horizon", () => {
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 10000, aprBasisPoints: 0 })], 0, "snowball");
    expect(plan.payoffPossible).toBe(false);
    expect(plan.monthsToPayoff).toBe(0);
  });

  it("still pays in priority order when the budget is below the sum of minimums", () => {
    const plan = planDebtPayoff(
      [
        card({ id: "A", balanceCents: 10000, aprBasisPoints: 0 }),
        card({ id: "B", balanceCents: 10000, aprBasisPoints: 0 }),
      ],
      1000,
      "snowball",
    );
    // Both cards want a $25 minimum, but only $10 is budgeted: the first
    // priority card gets it all.
    const first = plan[0].cards.find((c) => c.id === "A")!;
    const second = plan[0].cards.find((c) => c.id === "B")!;
    expect(first.paymentCents).toBe(1000);
    expect(second.paymentCents).toBe(0);
    expect(plan.payoffPossible).toBe(true);
  });

  it("defaults to snowball and honours an explicit avalanche strategy", () => {
    const cards = [card({ id: "c", balanceCents: 10000, aprBasisPoints: 2400 })];
    expect(planDebtPayoff(cards, 5000).strategy).toBe("snowball");
    expect(planDebtPayoff(cards, 5000, "avalanche").strategy).toBe("avalanche");
  });
});

describe("planDebtPayoff stored minimum payments", () => {
  // $3,000 at 19.99% and a $1,000 loan; the budget is far above any minimum, so only the split changes.
  const withMin = (minimumPaymentCents: number | null) => [
    card({ id: "card", balanceCents: 300000, aprBasisPoints: 1999, minimumPaymentCents }),
    card({ id: "loan", balanceCents: 100000, aprBasisPoints: 600, minimumPaymentCents: null }),
  ];

  it("uses a stored minimum instead of the 2% / $25 estimate", () => {
    const estimated = planDebtPayoff(withMin(null), 40000, "avalanche");
    const stored = planDebtPayoff(withMin(25000), 40000, "avalanche");

    // Estimate for month 1: 2% of ~$3,050 on the card and the $25 floor on the loan.
    expect(estimated[0].cards[0].minimumPaymentCents).toBeLessThan(25000);
    expect(estimated[0].cards[1].minimumPaymentCents).toBe(2500);
    expect(stored[0].cards[0].minimumPaymentCents).toBe(25000);
    expect(stored[0].totalMinimumPaymentCents).toBe(25000 + 2500);
  });

  it("changes the plan when the stored minimum exceeds what the budget leaves after the estimate", () => {
    // Budget just covers the stored minimums, so nothing is left over for the priority account.
    const estimated = planDebtPayoff(withMin(null), 30000, "snowball");
    const stored = planDebtPayoff(withMin(28000), 30000, "snowball");
    expect(stored.monthsToPayoff).not.toBe(estimated.monthsToPayoff);
    expect(stored.totalInterestCents).not.toBe(estimated.totalInterestCents);
  });

  it("never pays more than the balance when the stored minimum is larger than what is left", () => {
    const plan = planDebtPayoff([card({ id: "c", balanceCents: 10000, aprBasisPoints: 0, minimumPaymentCents: 50000 })], 60000, "snowball");
    expect(plan.monthsToPayoff).toBe(1);
    expect(plan[0].cards[0].paymentCents).toBe(10000);
    expect(plan.paidOff).toBe(true);
  });
});