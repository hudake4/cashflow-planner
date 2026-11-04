import { describe, expect, it } from "vitest";
import type { AccountKind } from "@/contracts/api";
import { buildReview, type PaidBill } from "@/domain/review";
import { buildSpending, type SpendingTransaction } from "@/domain/spending";

// A Tuesday. With weeks starting on Sunday this week began Nov 1; starting on Monday, Nov 2.
const TODAY = "2026-11-03";

let nextId = 0;
const tx = (date: string, description: string, amountCents: number, accountKind: AccountKind = "BANK", accountId = accountKind.toLowerCase()): SpendingTransaction => ({
  id: `t${nextId++}`,
  date,
  description,
  amountCents,
  accountKind,
  accountId,
});
const run = (transactions: SpendingTransaction[], paidBills: PaidBill[] = [], weekStartsOn = 0, today = TODAY) =>
  buildReview({ transactions, paidBills, today, weekStartsOn });

describe("buildReview periods", () => {
  it("compares this month and this week with the previous ones, and with the previous one up to the same day", () => {
    const r = run([
      tx("2026-11-01", "ACME PAYROLL", 100000),
      tx("2026-10-31", "ACME PAYROLL", 50000),
      tx("2026-10-03", "ACME PAYROLL", 70000),
      tx("2026-10-04", "ACME PAYROLL", 30000),
    ]);

    expect(r.month.current).toMatchObject({ from: "2026-11-01", to: "2026-11-03", incomeCents: 100000 });
    expect(r.month.previous).toMatchObject({ from: "2026-10-01", to: "2026-10-31", incomeCents: 150000 });
    // October 1-3 only: the paycheck on the 4th is after "this day" last month.
    expect(r.month.previousToDate.incomeCents).toBe(70000);

    expect(r.week.current).toMatchObject({ from: "2026-11-01", to: "2026-11-03", incomeCents: 100000 });
    expect(r.week.previous).toMatchObject({ from: "2026-10-25", to: "2026-10-31", incomeCents: 50000 });
    expect(r.week.previousToDate.incomeCents).toBe(0);
  });

  it("starts the week on the day the settings say", () => {
    const r = run([tx("2026-11-01", "ACME PAYROLL", 100000), tx("2026-10-26", "ACME PAYROLL", 20000)], [], 1);
    expect(r.week.current).toMatchObject({ from: "2026-11-02", to: "2026-11-03", incomeCents: 0 });
    expect(r.week.previous).toMatchObject({ from: "2026-10-26", to: "2026-11-01", incomeCents: 120000 });
    expect(r.week.previousToDate.incomeCents).toBe(20000);
  });

  it("on the first day of a week compares one day with the same day of the previous week", () => {
    const r = run([tx("2026-10-25", "ACME PAYROLL", 5000), tx("2026-10-26", "ACME PAYROLL", 9000)], [], 0, "2026-11-01");
    expect(r.week.current).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    expect(r.week.previousToDate.incomeCents).toBe(5000);
  });

  it("handles January: last month is December of the year before", () => {
    const r = run([tx("2025-12-31", "ACME PAYROLL", 5000)], [], 0, "2026-01-02");
    expect(r.month.previous).toMatchObject({ from: "2025-12-01", to: "2025-12-31", incomeCents: 5000 });
  });

  it("reports the earliest transaction as the coverage start, and null with none", () => {
    expect(run([tx("2026-10-20", "KROGER", -1000), tx("2026-10-10", "KROGER", -1000)]).coverageStart).toBe("2026-10-10");
    expect(run([]).coverageStart).toBeNull();
  });
});

describe("buildReview income", () => {
  const income = (transactions: SpendingTransaction[]) => run(transactions).month.current.incomeCents;

  it("counts deposits to bank accounts", () => {
    expect(income([tx("2026-11-02", "ACME PAYROLL", 100000), tx("2026-11-03", "IRS TREAS 310 TAX REF", 8000)])).toBe(108000);
  });

  it("leaves out money that arrives on a credit card or any account that isn't a bank account", () => {
    expect(income([tx("2026-11-02", "AUTOMATIC PAYMENT THANK YOU", 40000, "CREDIT"), tx("2026-11-02", "ACME PAYROLL", 1000, "OTHER")])).toBe(0);
  });

  it("leaves out transfers by their words", () => {
    expect(income([tx("2026-11-02", "Transfer from Savings", 50000), tx("2026-11-02", "ZELLE FROM JOHN", 2000)])).toBe(0);
  });

  it("leaves out refunds", () => {
    expect(income([tx("2026-11-02", "AMAZON REFUND", 2500), tx("2026-11-02", "TARGET MERCHANDISE RETURN", 1500)])).toBe(0);
  });

  it("leaves out the receipt of money that left another bank account, however it is worded", () => {
    const out = tx("2026-10-31", "ONLINE BANKING 8841", -30000, "BANK", "checking");
    const received = tx("2026-11-02", "DEPOSIT 4471", 30000, "BANK", "savings");
    const pay = tx("2026-11-02", "ACME PAYROLL", 30000, "BANK", "checking");
    // The paycheck is the same amount but leaves no other account: only the matched deposit is a transfer.
    expect(income([out, received, pay])).toBe(30000);
    expect(income([out, received])).toBe(0);
  });

  it("does not read a deposit as a transfer when the matching debit is on the same account", () => {
    expect(income([tx("2026-10-31", "CHECK 101", -30000, "BANK", "checking"), tx("2026-11-02", "CHECK DEPOSIT", 30000, "BANK", "checking")])).toBe(30000);
  });

  it("does not count a deposit whose account is unknown", () => {
    const unknown: SpendingTransaction = { id: "u", date: "2026-11-02", description: "ACME PAYROLL", amountCents: 1000 };
    expect(income([unknown])).toBe(0);
  });
});

describe("buildReview spending", () => {
  it("uses the Spend Analyzer's totals and categories for the month", () => {
    const transactions = [
      tx("2026-11-02", "KROGER #12", -4500),
      tx("2026-11-03", "SHELL OIL", -3000),
      tx("2026-10-05", "KROGER #12", -8000),
      tx("2026-10-20", "Transfer to Savings", -9000),
      tx("2026-10-21", "NETFLIX.COM", -1500),
    ];
    const r = run(transactions);
    const spending = buildSpending({ transactions, today: TODAY });

    expect(r.month.current.spendingCents).toBe(spending.thisMonth.totalCents);
    expect(r.month.previous.spendingCents).toBe(spending.lastMonth.totalCents);
    expect(r.month.previousToDate.spendingCents).toBe(spending.lastMonthToDateCents);
    expect(r.month.categories).toEqual([
      { category: "GROCERIES", currentCents: 4500, previousCents: 8000 },
      { category: "GAS", currentCents: 3000, previousCents: 0 },
      { category: "ENTERTAINMENT", currentCents: 0, previousCents: 1500 },
    ]);
  });

  it("computes the week from its own range", () => {
    const r = run([tx("2026-11-02", "KROGER", -4500), tx("2026-10-28", "KROGER", -2000), tx("2026-10-10", "KROGER", -9999)]);
    expect(r.week.current.spendingCents).toBe(4500);
    expect(r.week.previous.spendingCents).toBe(2000);
    expect(r.week.categories).toEqual([{ category: "GROCERIES", currentCents: 4500, previousCents: 2000 }]);
  });

  it("nets income against spending, and bills are not subtracted again", () => {
    const r = run(
      [tx("2026-11-02", "ACME PAYROLL", 100000), tx("2026-11-02", "LANDMARK APARTMENTS RENT", -80000)],
      [{ dueDate: "2026-11-02", amountCents: 80000 }],
    );
    expect(r.month.current).toMatchObject({ incomeCents: 100000, spendingCents: 80000, billsCents: 80000, netCents: 20000 });
  });

  it("is negative when spending is more than income", () => {
    expect(run([tx("2026-11-02", "KROGER", -4500)]).month.current.netCents).toBe(-4500);
  });
});

describe("buildReview bills", () => {
  it("sums the paid bills by due date and counts them", () => {
    const r = run(
      [],
      [
        { dueDate: "2026-11-01", amountCents: 120000 },
        { dueDate: "2026-11-03", amountCents: 1500 },
        { dueDate: "2026-10-30", amountCents: 9000 },
        { dueDate: "2026-10-15", amountCents: 700 },
        { dueDate: "2026-09-30", amountCents: 99999 },
      ],
    );
    expect(r.month.current).toMatchObject({ billsCents: 121500, billsCount: 2 });
    expect(r.month.previous).toMatchObject({ billsCents: 9700, billsCount: 2 });
    expect(r.month.previousToDate).toMatchObject({ billsCents: 0 });
    expect(r.week.current).toMatchObject({ billsCents: 121500, billsCount: 2 });
    expect(r.week.previous).toMatchObject({ billsCents: 9000, billsCount: 1 });
  });

  it("has all zeros and no categories with nothing to count", () => {
    const r = run([]);
    expect(r.month.current).toEqual({ from: "2026-11-01", to: TODAY, incomeCents: 0, billsCents: 0, billsCount: 0, spendingCents: 0, netCents: 0 });
    expect(r.month.categories).toEqual([]);
  });
});
