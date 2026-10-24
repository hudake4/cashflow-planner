import { describe, expect, it } from "vitest";
import type { SpendingCategory } from "@/contracts/api";
import { buildSpending, categorize, type SpendingTransaction } from "@/domain/spending";

const TODAY = "2026-10-24";

const tx = (date: string, description: string, amountCents: number): SpendingTransaction => ({ date, description, amountCents });
const run = (transactions: SpendingTransaction[], today = TODAY) => buildSpending({ transactions, today });

describe("categorize", () => {
  const cases: [string, SpendingCategory][] = [
    // Each category
    ["KROGER #1234 ATLANTA GA", "GROCERIES"],
    ["Trader Joe's #552", "GROCERIES"],
    ["WHOLE FOODS MKT 10234", "GROCERIES"],
    ["STARBUCKS STORE 1234", "DINING"],
    ["Joe's Pizza", "DINING"],
    ["SQ *BLUE BOTTLE CAFÉ", "DINING"],
    ["DOORDASH*CHIPOTLE", "DINING"],
    ["SHELL OIL 57444", "GAS"],
    ["EXXONMOBIL 1234", "GAS"],
    ["BP#1234567 MAIN ST", "GAS"],
    ["DUKE ENERGY BILL PAY", "UTILITIES"],
    ["PG&E WEB ONLINE", "UTILITIES"],
    ["COMCAST CABLE COMM", "UTILITIES"],
    ["AT&T *BILL PAYMENT", "UTILITIES"],
    ["T-MOBILE AUTOPAY", "UTILITIES"],
    ["CITY WATER AND SEWER", "UTILITIES"],
    ["LANDMARK APARTMENTS RENT", "BILLS"],
    ["GEICO AUTO", "BILLS"],
    ["WELLS FARGO HOME MORTGAGE", "BILLS"],
    ["STUDENT LOAN SERVICING", "BILLS"],
    ["LYFT *RIDE SAT 8PM", "TRANSPORT"],
    ["UBER *TRIP HELP.UBER.COM", "TRANSPORT"],
    ["ATL AIRPORT PARKING", "TRANSPORT"],
    ["DELTA AIR LINES 0062345", "TRANSPORT"],
    ["NETFLIX.COM", "ENTERTAINMENT"],
    ["SPOTIFY USA", "ENTERTAINMENT"],
    ["AMC THEATRES 1234", "ENTERTAINMENT"],
    ["STEAM PURCHASE", "ENTERTAINMENT"],
    ["WALGREENS #5432", "HEALTH"],
    ["PLANET FITNESS", "HEALTH"],
    ["SMILE DENTAL GROUP", "HEALTH"],
    ["AMAZON.COM*AB12CD", "SHOPPING"],
    ["BEST BUY 00001234", "SHOPPING"],
    ["Transfer to Savings", "TRANSFERS"],
    ["VENMO PAYMENT", "TRANSFERS"],
    ["ZELLE TO JOHN", "TRANSFERS"],
    ["ATM WITHDRAWAL 1234", "TRANSFERS"],
    ["CHASE CREDIT CARD PAYMENT", "TRANSFERS"],
    ["PAYMENT THANK YOU", "TRANSFERS"],
    ["CASH APP*SOMEONE", "TRANSFERS"],
    // Overlaps
    ["WALMART SUPERCENTER #1234", "SHOPPING"],
    ["WALMART GROCERY PICKUP", "GROCERIES"],
    ["COSTCO GAS #123", "GAS"],
    ["COSTCO WHOLESALE", "GROCERIES"],
    ["UBER EATS HELP.UBER.COM", "DINING"],
    ["UBEREATS", "DINING"],
    ["CVS/PHARMACY #1234", "HEALTH"],
    ["COFFEE SHOP DOWNTOWN", "DINING"],
    ["ATLANTA GAS LIGHT", "UTILITIES"],
    ["ENTERPRISE RENT-A-CAR", "TRANSPORT"],
    ["DELTA DENTAL OF GEORGIA", "HEALTH"],
    ["EXXON MOBIL REWARDS", "GAS"],
    ["VENMO CASHOUT TRANSFER", "TRANSFERS"],
    // Whole words only
    ["BARNES AND NOBLE", "OTHER"],
    ["BPX ENERGY LLC", "UTILITIES"],
    ["TARGETED ADVERTISING INC", "OTHER"],
    ["PRENTICE HALL", "OTHER"],
    // Fallback
    ["JOE'S HARDWARE", "OTHER"],
    ["", "OTHER"],
    ["POS DEBIT 123456", "OTHER"],
  ];

  it.each(cases)("%s -> %s", (description, expected) => {
    expect(categorize(description)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(categorize("netflix.com")).toBe(categorize("NETFLIX.COM"));
  });
});

describe("buildSpending periods", () => {
  it("sums this month from the 1st through today and last month in full", () => {
    const out = run([
      tx("2026-10-01", "KROGER", -5000),
      tx("2026-10-24", "KROGER", -2500),
      tx("2026-09-01", "KROGER", -1000),
      tx("2026-09-30", "KROGER", -2000),
    ]);
    expect(out.thisMonth).toMatchObject({ from: "2026-10-01", to: "2026-10-24", totalCents: 7500, transactionCount: 2 });
    expect(out.lastMonth).toMatchObject({ from: "2026-09-01", to: "2026-09-30", totalCents: 3000, transactionCount: 2 });
  });

  it("ignores future-dated rows and rows outside the two months", () => {
    const out = run([
      tx("2026-10-25", "KROGER", -9999),
      tx("2026-08-31", "KROGER", -8888),
      tx("2026-10-10", "KROGER", -100),
    ]);
    expect(out.thisMonth.totalCents).toBe(100);
    expect(out.lastMonth.totalCents).toBe(0);
    expect(out.lastMonthToDateCents).toBe(0);
  });

  it("rolls January back to the previous December", () => {
    const out = run([tx("2025-12-31", "KROGER", -400), tx("2025-12-01", "KROGER", -600), tx("2025-11-30", "KROGER", -999), tx("2026-01-05", "KROGER", -100)], "2026-01-15");
    expect(out.lastMonth).toMatchObject({ from: "2025-12-01", to: "2025-12-31", totalCents: 1000 });
    expect(out.thisMonth).toMatchObject({ from: "2026-01-01", to: "2026-01-15", totalCents: 100 });
    expect(out.lastMonthToDateCents).toBe(600);
  });

  it("only counts money out as spending, as a positive magnitude", () => {
    const out = run([tx("2026-10-02", "ACME PAYROLL", 250000), tx("2026-10-03", "KROGER REFUND", 1000), tx("2026-10-04", "KROGER", -1500), tx("2026-10-05", "ZERO", 0)]);
    expect(out.thisMonth.totalCents).toBe(1500);
    expect(out.thisMonth.transactionCount).toBe(1);
  });

  it("keeps transfers out of the total, categories and merchants", () => {
    const out = run([
      tx("2026-10-02", "CHASE CREDIT CARD PAYMENT", -120000),
      tx("2026-10-03", "ZELLE TO JOHN", -5000),
      tx("2026-10-04", "ZELLE FROM JOHN", 2000),
      tx("2026-10-05", "KROGER", -3000),
    ]);
    expect(out.thisMonth).toMatchObject({ totalCents: 3000, transactionCount: 1, transfersCents: 125000 });
    expect(out.thisMonth.categories.map((c) => c.category)).toEqual(["GROCERIES"]);
    expect(out.thisMonth.topMerchants.map((m) => m.name)).toEqual(["Kroger"]);
  });

  it("returns zeros and a null coverageStart for no transactions", () => {
    const out = run([]);
    expect(out).toEqual({
      thisMonth: { from: "2026-10-01", to: "2026-10-24", totalCents: 0, transactionCount: 0, transfersCents: 0, categories: [], topMerchants: [] },
      lastMonth: { from: "2026-09-01", to: "2026-09-30", totalCents: 0, transactionCount: 0, transfersCents: 0, categories: [], topMerchants: [] },
      lastMonthToDateCents: 0,
      coverageStart: null,
    });
  });

  it("reports the earliest date of every transaction as coverageStart, even income or out of range", () => {
    const out = run([tx("2026-10-10", "KROGER", -100), tx("2026-08-02", "ACME PAYROLL", 5000), tx("2026-09-12", "KROGER", -100)]);
    expect(out.coverageStart).toBe("2026-08-02");
  });
});

describe("buildSpending last month to date", () => {
  it("compares through the same day number", () => {
    const out = run([tx("2026-09-24", "KROGER", -100), tx("2026-09-25", "KROGER", -200), tx("2026-09-01", "KROGER", -400)]);
    expect(out.lastMonthToDateCents).toBe(500);
    expect(out.lastMonth.totalCents).toBe(700);
  });

  it("clamps to the end of a short February (Mar 30 and Mar 31)", () => {
    const feb = [tx("2026-02-01", "KROGER", -100), tx("2026-02-28", "KROGER", -200)];
    expect(run(feb, "2026-03-30").lastMonthToDateCents).toBe(300);
    expect(run(feb, "2026-03-31").lastMonthToDateCents).toBe(300);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const feb = [tx("2028-02-28", "KROGER", -100), tx("2028-02-29", "KROGER", -200)];
    expect(run(feb, "2028-03-30").lastMonthToDateCents).toBe(300);
    expect(run(feb, "2028-03-28").lastMonthToDateCents).toBe(100);
  });

  it("excludes transfers", () => {
    const out = run([tx("2026-09-02", "ZELLE TO JOHN", -9000), tx("2026-09-03", "KROGER", -100)]);
    expect(out.lastMonthToDateCents).toBe(100);
  });
});

describe("buildSpending categories", () => {
  it("sorts by total, then by display order, and omits empty categories", () => {
    const out = run([
      tx("2026-10-02", "NETFLIX.COM", -1000),
      tx("2026-10-03", "STARBUCKS", -1000),
      tx("2026-10-04", "KROGER", -400),
      tx("2026-10-05", "KROGER", -600),
      tx("2026-10-06", "SHELL OIL", -9000),
    ]);
    expect(out.thisMonth.categories).toEqual([
      { category: "GAS", totalCents: 9000, transactionCount: 1 },
      { category: "GROCERIES", totalCents: 1000, transactionCount: 2 },
      { category: "DINING", totalCents: 1000, transactionCount: 1 },
      { category: "ENTERTAINMENT", totalCents: 1000, transactionCount: 1 },
    ]);
  });
});

describe("buildSpending top merchants", () => {
  it("groups by normalised name, ignoring reference numbers", () => {
    const out = run([
      tx("2026-10-02", "KROGER #1234 ATLANTA", -1000),
      tx("2026-10-09", "POS DEBIT KROGER #9876 ATLANTA", -2000),
    ]);
    expect(out.thisMonth.topMerchants).toEqual([{ name: "Kroger Atlanta", category: "GROCERIES", totalCents: 3000, transactionCount: 2 }]);
  });

  it("names a merchant from its newest description", () => {
    const out = run([tx("2026-10-09", "NETFLIX.COM 9999", -1549), tx("2026-10-02", "NETFLIX.COM 1111", -1549)]);
    expect(out.thisMonth.topMerchants[0]).toMatchObject({ name: "Netflix.com", category: "ENTERTAINMENT", totalCents: 3098 });
  });

  it("returns at most 5, largest first, ties by name", () => {
    const names = ["ALPHA", "BRAVO", "CHARLIE", "DELTA FOO", "ECHO", "FOXTROT", "GOLF"];
    const out = run(names.map((n, i) => tx("2026-10-02", `${n} LLC`, -(i === 2 ? 5000 : 1000))));
    expect(out.thisMonth.topMerchants.map((m) => m.name)).toEqual(["Charlie Llc", "Alpha Llc", "Bravo Llc", "Delta Foo Llc", "Echo Llc"]);
  });

  it("is computed per period", () => {
    const out = run([tx("2026-10-02", "KROGER", -100), tx("2026-09-02", "PUBLIX", -200)]);
    expect(out.thisMonth.topMerchants.map((m) => m.name)).toEqual(["Kroger"]);
    expect(out.lastMonth.topMerchants.map((m) => m.name)).toEqual(["Publix"]);
  });
});
