/**
 * Debt payoff planner (issue #50). Pure: no Prisma, no clock, no I/O. Money is
 * integer cents. Given a set of credit-card balances, an APR and (optionally) a
 * minimum payment per card, plus a total monthly budget, this projects a
 * month-by-month payoff schedule for a chosen strategy:
 *
 *   - "snowball": lowest balance first (roll payments as cards are cleared)
 *   - "avalanche": highest APR first
 *
 * Each month accrues interest at APR/12, pays the minimum on every card, then
 * puts the remainder toward the priority card. Cards with a zero balance are
 * skipped.
 */
export type DebtPayoffStrategy = "snowball" | "avalanche";

export interface DebtPayoffCardInput {
  id?: string | number;
  name?: string;
  cardName?: string;
  accountName?: string;
  label?: string;

  balanceCents?: number;
  balance?: number;
  currentBalanceCents?: number;
  currentBalance?: number;
  amountOwedCents?: number;
  amountOwed?: number;
  owedCents?: number;
  owed?: number;
  principalCents?: number;
  principal?: number;

  aprBasisPoints?: number | null;
  aprBps?: number | null;
  aprPercent?: number | null;
  apr?: number | null;
  interestRate?: number | null;
  rate?: number | null;
  annualRate?: number | null;

  minimumPaymentCents?: number | null;
  minimumPayment?: number | null;
  minPaymentCents?: number | null;
  minPayment?: number | null;
  minCents?: number | null;
  min?: number | null;
  minimumPaymentRule?: string | null;
}

export interface DebtPayoffCard {
  id: string;
  name: string;
  balanceCents: number;
  aprBasisPoints: number;
  minimumPaymentCents: number | null;
}

export interface DebtPayoffMonthCard {
  id: string;
  name: string;
  startingBalanceCents: number;
  interestCents: number;
  minimumPaymentCents: number;
  paymentCents: number;
  extraPaymentCents: number;
  endingBalanceCents: number;
  paidOff: boolean;
}

export interface DebtPayoffMonth {
  month: number;
  cards: DebtPayoffMonthCard[];
  totalPaymentCents: number;
  totalInterestCents: number;
  totalMinimumPaymentCents: number;
  extraPaymentCents: number;
  remainingBalanceCents: number;
  paidOffCards: string[];
}

export type DebtPayoffSchedule = DebtPayoffMonth[] & {
  strategy: DebtPayoffStrategy;
  monthlyPaymentCents: number;
  monthsToPayoff: number;
  totalMonths: number;
  payoffMonths: number;
  monthCount: number;
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  paidOff: boolean;
  /**
   * True when the plan actually reduces the debt (the monthly budget exceeds the
   * interest that accrues). False when the budget only covers interest — the
   * balance can never shrink, so `planDebtPayoff` stops projecting early instead
   * of compounding interest over the full horizon.
   */
  payoffPossible: boolean;
  cards: DebtPayoffCard[];
  schedule: DebtPayoffSchedule;
};

const MAX_MONTHS = 1200;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickNumber(card: DebtPayoffCardInput, keys: (keyof DebtPayoffCardInput)[]): number | null {
  for (const key of keys) {
    const v = toNumber(card[key]);
    if (v !== null) return v;
  }
  return null;
}

function cents(value: number | null): number {
  if (value === null) return 0;
  return Math.round(value);
}

function aprToBasisPoints(card: DebtPayoffCardInput): number {
  const bpKeys: (keyof DebtPayoffCardInput)[] = ["aprBasisPoints", "aprBps"];
  for (const key of bpKeys) {
    const v = toNumber(card[key]);
    if (v !== null) return Math.max(0, Math.round(v));
  }

  const pctKeys: (keyof DebtPayoffCardInput)[] = ["aprPercent"];
  for (const key of pctKeys) {
    const v = toNumber(card[key]);
    if (v !== null) return Math.max(0, Math.round(v * 100));
  }

  const autoKeys: (keyof DebtPayoffCardInput)[] = ["apr", "interestRate", "rate", "annualRate"];
  for (const key of autoKeys) {
    const v = toNumber(card[key]);
    if (v === null) continue;
    if (v <= 1) return Math.max(0, Math.round(v * 10000));
    if (v <= 100) return Math.max(0, Math.round(v * 100));
    return Math.max(0, Math.round(v));
  }

  return 0;
}

function normalizeCard(card: DebtPayoffCardInput, index: number): DebtPayoffCard {
  const balanceRaw = pickNumber(card, [
    "balanceCents",
    "currentBalanceCents",
    "amountOwedCents",
    "owedCents",
    "principalCents",
    "balance",
    "currentBalance",
    "amountOwed",
    "owed",
    "principal",
  ]);
  const balance = Math.max(0, cents(balanceRaw));

  const minRaw = pickNumber(card, [
    "minimumPaymentCents",
    "minPaymentCents",
    "minCents",
    "minimumPayment",
    "minPayment",
    "min",
  ]);

  const name =
    (typeof card.name === "string" && card.name.trim()) ||
    (typeof card.cardName === "string" && card.cardName.trim()) ||
    (typeof card.accountName === "string" && card.accountName.trim()) ||
    (typeof card.label === "string" && card.label.trim()) ||
    `Card ${index + 1}`;

  const idRaw = card.id;
  const id =
    idRaw === undefined || idRaw === null
      ? `card-${index + 1}`
      : String(idRaw);

  return {
    id,
    name,
    balanceCents: balance,
    aprBasisPoints: aprToBasisPoints(card),
    minimumPaymentCents: minRaw === null ? null : Math.max(0, cents(minRaw)),
  };
}

function normalizeStrategy(strategy: unknown): DebtPayoffStrategy {
  const text = String(strategy ?? "").toLowerCase();
  if (text.includes("avalanche") || text.includes("rate") || text.includes("apr") || text.includes("interest") || text.includes("highest")) {
    return "avalanche";
  }
  return "snowball";
}

function monthlyRateBp(aprBasisPoints: number): number {
  return aprBasisPoints / 10000 / 12;
}

function dynamicMinimum(balance: number): number {
  const twoPct = Math.round(balance * 0.02);
  return Math.min(balance, Math.max(2500, twoPct));
}

export function planDebtPayoff(
  cardsInput: readonly DebtPayoffCardInput[] | null | undefined,
  monthlyPaymentCents: number,
  strategy: unknown = "snowball",
): DebtPayoffSchedule {
  const strategyNorm = normalizeStrategy(strategy);
  const cards = (cardsInput ?? []).map(normalizeCard).filter((c) => c.balanceCents > 0);

  const budget = Math.max(0, Math.round(monthlyPaymentCents ?? 0));

  const order = cards.map((_, i) => i).sort((a, b) => {
    if (strategyNorm === "snowball") {
      if (cards[a].balanceCents !== cards[b].balanceCents) return cards[a].balanceCents - cards[b].balanceCents;
      if (cards[a].aprBasisPoints !== cards[b].aprBasisPoints) return cards[b].aprBasisPoints - cards[a].aprBasisPoints;
      return a - b;
    }
    if (cards[a].aprBasisPoints !== cards[b].aprBasisPoints) return cards[b].aprBasisPoints - cards[a].aprBasisPoints;
    if (cards[a].balanceCents !== cards[b].balanceCents) return cards[a].balanceCents - cards[b].balanceCents;
    return a - b;
  });

  const balances = cards.map((c) => c.balanceCents);
  const paidOff = cards.map(() => false);
  const minStored = cards.map((c) => c.minimumPaymentCents);

  const schedule: DebtPayoffMonth[] = [];
  let totalInterestCents = 0;
  let totalPaidCents = 0;
  let allPaid = cards.length === 0;
  let nonAmortizing = false;

  for (let month = 1; month <= MAX_MONTHS && !allPaid; month++) {
    const startingBalances = [...balances];
    const interestThis = balances.map((b, i) => {
      if (paidOff[i] || b <= 0) return 0;
      return Math.round(b * monthlyRateBp(cards[i].aprBasisPoints));
    });

    for (let i = 0; i < cards.length; i++) {
      if (!paidOff[i] && balances[i] > 0) balances[i] += interestThis[i];
    }

    const monthInterestTotal = interestThis.reduce((s, x) => s + x, 0);
    if (budget <= 0 || (monthInterestTotal > 0 && budget <= monthInterestTotal)) {
      // No progress: either nothing is paid, or the whole budget only covers
      // interest. The balance can never shrink, so stop instead of compounding
      // interest across the full horizon.
      nonAmortizing = true;
      break;
    }

    const minDues = balances.map((b, i) => {
      if (paidOff[i] || b <= 0) return 0;
      const stored = minStored[i];
      if (stored !== null) return Math.min(b, stored);
      return dynamicMinimum(b);
    });

    const payments = balances.map(() => 0);
    const minApplied = balances.map(() => 0);

    let remainingBudget = budget;
    const sumMin = minDues.reduce((s, x) => s + x, 0);

    if (sumMin <= remainingBudget || sumMin === 0) {
      for (let i = 0; i < cards.length; i++) {
        if (paidOff[i] || balances[i] <= 0) continue;
        payments[i] += minDues[i];
        minApplied[i] = minDues[i];
        remainingBudget -= minDues[i];
      }
    } else {
      for (const idx of order) {
        if (paidOff[idx] || balances[idx] <= 0) continue;
        if (remainingBudget <= 0) break;
        const pay = Math.min(minDues[idx], remainingBudget);
        payments[idx] += pay;
        minApplied[idx] = pay;
        remainingBudget -= pay;
      }
    }

    const unpaidPriority = order.filter((i) => !paidOff[i] && balances[i] > 0);
    let extraPool = remainingBudget;
    let ei = 0;
    while (extraPool > 0 && ei < unpaidPriority.length) {
      const i = unpaidPriority[ei];
      const alreadyPaid = payments[i];
      const remainingOnCard = Math.max(0, balances[i] - alreadyPaid);
      if (remainingOnCard <= 0) {
        ei++;
        continue;
      }
      const pay = Math.min(remainingOnCard, extraPool);
      payments[i] += pay;
      extraPool -= pay;
      if (pay >= remainingOnCard) ei++;
      else break;
    }

    const paidThisMonth: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      if (paidOff[i] || balances[i] <= 0) continue;
      const before = balances[i];
      balances[i] = Math.max(0, before - payments[i]);
      if (balances[i] === 0 && before > 0) {
        paidOff[i] = true;
        paidThisMonth.push(cards[i].id);
      }
    }

    totalInterestCents += monthInterestTotal;
    const monthPaymentTotal = payments.reduce((s, x) => s + x, 0);
    totalPaidCents += monthPaymentTotal;

    const cardEntries: DebtPayoffMonthCard[] = cards.map((c, i) => ({
      id: c.id,
      name: c.name,
      startingBalanceCents: startingBalances[i],
      interestCents: interestThis[i],
      minimumPaymentCents: minDues[i],
      paymentCents: payments[i],
      extraPaymentCents: Math.max(0, payments[i] - minApplied[i]),
      endingBalanceCents: balances[i],
      paidOff: paidOff[i] && startingBalances[i] > 0,
    }));

    schedule.push({
      month,
      cards: cardEntries,
      totalPaymentCents: monthPaymentTotal,
      totalInterestCents: monthInterestTotal,
      totalMinimumPaymentCents: minDues.reduce((s, x) => s + x, 0),
      extraPaymentCents: Math.max(0, monthPaymentTotal - minDues.reduce((s, x) => s + x, 0)),
      remainingBalanceCents: balances.reduce((s, x) => s + x, 0),
      paidOffCards: paidThisMonth,
    });

    allPaid = balances.every((b) => b <= 0);
  }

  const result = schedule as DebtPayoffSchedule;
  result.strategy = strategyNorm;
  result.monthlyPaymentCents = budget;
  result.monthsToPayoff = schedule.length;
  result.totalMonths = schedule.length;
  result.payoffMonths = schedule.length;
  result.monthCount = schedule.length;
  result.months = schedule.length;
  result.totalInterestCents = totalInterestCents;
  result.totalPaidCents = totalPaidCents;
  result.paidOff = allPaid || cards.length === 0;
  result.payoffPossible = !nonAmortizing;
  result.cards = cards;
  result.schedule = result;
  return result;
}

export default planDebtPayoff;