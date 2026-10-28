/** Register CSV (CONVENTIONS section 18): escaping, formula safety, exact money. */
import { describe, expect, it } from "vitest";
import { CSV_BOM, csvField, neutralizeFormula, registerToCsv, toCsv } from "@/domain/register-csv";
import { computeProjection } from "@/domain/projection";
import { bill, income, input, occ, settings } from "../helpers/fixtures";

/** CSV text without the BOM, as lines. */
const lines = (csv: string) => csv.replace(CSV_BOM, "").split("\r\n");

describe("csvField", () => {
  it("leaves plain text alone", () => {
    expect(csvField("Rent")).toBe("Rent");
    expect(csvField("")).toBe("");
  });

  it("quotes commas, quotes and line breaks, and doubles inner quotes", () => {
    expect(csvField("Smith, J.")).toBe('"Smith, J."');
    expect(csvField('The "big" one')).toBe('"The ""big"" one"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("a\rb")).toBe('"a\rb"');
  });
});

describe("neutralizeFormula", () => {
  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\t=1", "\r=1", "  =1+1", ' =HYPERLINK("http://x")'])("prefixes %j", (text) => {
    expect(neutralizeFormula(text)).toBe(`'${text}`);
  });

  it("leaves ordinary text, including a dash or equals sign inside it", () => {
    for (const text of ["Rent", "A-B", "1=1", "Mom's gift", "", "  spaced"]) expect(neutralizeFormula(text)).toBe(text);
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and ends with one", () => {
    expect(toCsv([["a", "b,c"], ["d", 'e"f']])).toBe('a,"b,c"\r\nd,"e""f"\r\n');
  });
});

describe("registerToCsv", () => {
  const projection = () =>
    computeProjection(
      input({
        settings: settings({ startingBalanceCents: 100000, forecastDays: 30 }),
        incomes: [income("pay", 250000, "BIWEEKLY", "2025-01-03", { name: "Paycheck" })],
        bills: [
          bill("rent", 120000, "MONTHLY", "2025-01-05", { name: "Rent", category: "Housing" }),
          bill("gym", 1005, "WEEKLY", "2025-01-02", { name: "Gym, \"Big\" Club", category: "Health" }),
        ],
        occurrences: [occ("rent", "2025-01-05", "PAID", 119999), occ("gym", "2025-01-09", "SKIPPED")],
      }),
    );

  it("writes a BOM, the header with the currency, and one row per event in ledger order", () => {
    const p = projection();
    const csv = registerToCsv(p);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const rows = lines(csv).slice(0, -1);
    expect(rows[0]).toBe("Date,Name,Type,Category,Frequency,Status,Amount (USD),Balance after (USD)");
    expect(rows).toHaveLength(1 + p.events.length);
    expect(rows.slice(1).map((r) => r.slice(0, 10))).toEqual(p.events.map((e) => e.date));
  });

  it("signs amounts like the register, applies overrides and uses the engine's running balance", () => {
    const rows = lines(registerToCsv(projection()));
    // $1,000 opening; 01-02 gym -$10.05.
    expect(rows[1]).toBe('2025-01-02,"Gym, ""Big"" Club",Bill,Health,Weekly,Upcoming,-10.05,989.95');
    // 01-03 paycheck +$2,500.00.
    expect(rows[2]).toBe("2025-01-03,Paycheck,Income,,Biweekly,Scheduled,2500.00,3489.95");
    // 01-05 rent is paid with an override of $1,199.99.
    expect(rows[3]).toBe("2025-01-05,Rent,Bill,Housing,Monthly,Paid,-1199.99,2289.96");
  });

  it("keeps a skipped bill's amount, marks it Skipped and carries the balance unchanged", () => {
    const rows = lines(registerToCsv(projection()));
    const skipped = rows.findIndex((r) => r.startsWith("2025-01-09"));
    // Count from the end: the name has a comma in it.
    const [status, amount, balance] = rows[skipped].split(",").slice(-3);
    expect([status, amount]).toEqual(["Skipped", "-10.05"]);
    expect(balance).toBe(rows[skipped - 1].split(",").at(-1));
  });

  it("exports negative balances as plain negative numbers", () => {
    const p = computeProjection(input({ settings: settings({ startingBalanceCents: 500 }), bills: [bill("b", 1234, "ONE_TIME", "2025-01-02")] }));
    expect(lines(registerToCsv(p))[1]).toBe("2025-01-02,b,Bill,,One time,Upcoming,-12.34,-7.34");
  });

  it("neutralizes formulas in user text only", () => {
    const p = computeProjection(
      input({
        incomes: [income("i", 100, "ONE_TIME", "2025-01-02", { name: "=1+1" })],
        bills: [bill("b", 100, "ONE_TIME", "2025-01-03", { name: "@SUM(A1)", category: "-cmd" })],
      }),
    );
    const rows = lines(registerToCsv(p));
    expect(rows[1]).toBe("2025-01-02,'=1+1,Income,,One time,Scheduled,1.00,1001.00");
    // The leading minus of the amount stays: it is a number, not text.
    expect(rows[2]).toBe("2025-01-03,'@SUM(A1),Bill,'-cmd,One time,Upcoming,-1.00,1000.00");
  });

  it("is just the header for an empty register", () => {
    expect(lines(registerToCsv(computeProjection(input())))).toEqual([
      "Date,Name,Type,Category,Frequency,Status,Amount (USD),Balance after (USD)",
      "",
    ]);
  });
});
