import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { detectRecurring, nameTokens, type DetectInput, type ExistingSchedule, type ScanTransaction } from "@/domain/recurring";

const TODAY = "2026-10-24";

const tx = (date: string, description: string, amountCents: number): ScanTransaction => ({ date, description, amountCents });
const run = (transactions: ScanTransaction[], over: Partial<DetectInput> = {}) =>
  detectRecurring({ transactions, incomes: [], bills: [], today: TODAY, ...over });
const existing = (over: Partial<ExistingSchedule>): ExistingSchedule => ({
  name: "Existing",
  amountCents: 1000,
  frequency: "MONTHLY",
  anchorDate: "2026-01-01",
  endDate: null,
  ...over,
});

describe("nameTokens", () => {
  it("drops reference numbers and bank boilerplate", () => {
    expect(nameTokens("POS DEBIT NETFLIX.COM 800-555-1234 #8841")).toEqual(["netflix", "com"]);
    expect(nameTokens("AT&T Payment x4421")).toEqual(["att"]);
  });

  it("falls back to the boilerplate words when nothing else is left", () => {
    expect(nameTokens("ACH DEPOSIT")).toEqual(["ach", "deposit"]);
  });
});

describe("detectRecurring cadences", () => {
  it("finds a monthly subscription from two sightings and projects the next date", () => {
    const out = run([tx("2026-09-03", "NETFLIX.COM 1234", -1549), tx("2026-10-03", "NETFLIX.COM 5678", -1549)]);
    expect(out).toEqual([
      {
        key: "BILL:netflix com",
        kind: "BILL",
        name: "Netflix.com",
        amountCents: 1549,
        frequency: "MONTHLY",
        nextDate: "2026-11-03",
        occurrences: 2,
        seenDates: ["2026-09-03", "2026-10-03"],
        amountVaries: false,
        cardPayment: false,
      },
    ]);
  });

  it("finds biweekly pay as income with the next payday on or after today", () => {
    const pay = (d: string) => tx(d, "ACME CORP DIRECT DEP PAYROLL", 215000);
    const [s] = run([pay("2026-09-11"), pay("2026-09-25"), pay("2026-10-09"), pay("2026-10-23")]);
    expect(s).toMatchObject({ kind: "INCOME", frequency: "BIWEEKLY", amountCents: 215000, nextDate: "2026-11-06", occurrences: 4 });
  });

  it("finds a weekly charge and rolls the next date past today", () => {
    const t = (d: string) => tx(d, "Weekly Lawn Service", -6000);
    const [s] = run([t("2026-10-02"), t("2026-10-09"), t("2026-10-16")]);
    expect(s).toMatchObject({ frequency: "WEEKLY", nextDate: "2026-10-30" });
  });

  it("tolerates a bank posting a day or two late", () => {
    const out = run([tx("2026-08-28", "Gym", -4000), tx("2026-09-29", "Gym", -4000), tx("2026-10-30", "Gym", -4000)], { today: "2026-10-31" });
    expect(out[0]?.frequency).toBe("MONTHLY");
  });

  it("keeps a 31st-of-the-month payment on the 31st after a short month", () => {
    const [s] = run([tx("2026-08-31", "Storage Unit", -9900), tx("2026-09-30", "Storage Unit", -9900), tx("2026-10-31", "Storage Unit", -9900)], {
      today: "2026-10-31",
    });
    expect(s.nextDate).toBe("2026-11-30"); // clamped, since November has 30 days
    const [t] = run([tx("2026-07-31", "Storage Unit", -9900), tx("2026-08-31", "Storage Unit", -9900), tx("2026-09-30", "Storage Unit", -9900)], {
      today: "2026-10-01",
    });
    expect(t.nextDate).toBe("2026-10-31");
  });

  it("lets a variable monthly bill vary once it has been seen three times", () => {
    const [s] = run([tx("2026-08-12", "City Electric", -8000), tx("2026-09-12", "City Electric", -10500), tx("2026-10-12", "City Electric", -9100)]);
    expect(s).toMatchObject({ amountCents: 9100, amountVaries: true });
  });
});

describe("detectRecurring with a long history (recent unbroken run)", () => {
  const series = (description: string, last: string, step: number, amounts: number[]) =>
    amounts.map((a, i) => tx(addDays(last, -step * (amounts.length - 1 - i)), description, a));
  const monthly = (description: string, amounts: number[]) =>
    amounts.map((a, i) => {
      const index = 2026 * 12 + 9 - (amounts.length - 1 - i); // counts back from 2026-10
      return tx(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-03`, description, a);
    });

  it("finds a monthly charge with one missed month and reports only the recent run", () => {
    const all = monthly("SPOTIFY USA", Array(12).fill(-1199));
    const withGap = all.filter((t) => t.date !== "2026-03-03"); // 11 sightings
    expect(withGap).toHaveLength(11);
    const out = run(withGap);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ frequency: "MONTHLY", amountCents: 1199, nextDate: "2026-11-03", occurrences: 7 });
    expect(out[0].seenDates[0]).toBe("2026-04-03");
  });

  it("finds biweekly pay with one skipped pay period", () => {
    const pay = series("ACME CORP DIRECT DEP PAYROLL", "2026-10-23", 14, Array(14).fill(215000));
    const skipped = pay.filter((_, i) => i !== 5);
    const out = run(skipped);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "INCOME", frequency: "BIWEEKLY", nextDate: "2026-11-06", occurrences: 8 });
  });

  it("is not thrown off by an amount outlier early in the history", () => {
    const out = run(monthly("Gym", [-15000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amountCents: 4000, amountVaries: false, occurrences: 11 });
  });

  it("still finds a pattern when only the recent sightings are steady", () => {
    const out = run(monthly("Streaming Plus", [-500, -1800, -2500, -1299, -1299, -1299]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amountCents: 1299, occurrences: 3 });
  });

  it("leaves a seasonal bill that swings past the 40% tolerance undetected (documented decision)", () => {
    const amounts = [60, 55, 58, 70, 90, 120, 150, 180, 175, 160, 110, 70].map((d) => -d * 100);
    expect(run(monthly("City Electric", amounts))).toEqual([]);
  });

  it("does not detect a payment whose recent run is too short", () => {
    // Steady for months, then a charge 17 days after the last one: only that sighting is left in the run.
    const old = monthly("Old Habit", Array(6).fill(-2000));
    expect(run([...old, tx("2026-10-20", "Old Habit", -2000)])).toEqual([]);
  });
});

describe("detectRecurring rejects non-patterns", () => {
  it("ignores a single sighting", () => {
    expect(run([tx("2026-10-03", "Netflix", -1549)])).toEqual([]);
  });

  it("needs three sightings for weekly and biweekly", () => {
    expect(run([tx("2026-10-09", "Coffee Cart", -500), tx("2026-10-16", "Coffee Cart", -500)])).toEqual([]);
    expect(run([tx("2026-09-25", "Side Gig", 5000), tx("2026-10-09", "Side Gig", 5000)])).toEqual([]);
  });

  it("rejects two monthly sightings whose amounts differ a lot (probably groceries)", () => {
    expect(run([tx("2026-09-03", "Fresh Market", -4200), tx("2026-10-03", "Fresh Market", -9800)])).toEqual([]);
  });

  it("rejects irregular gaps", () => {
    expect(run([tx("2026-09-01", "Hardware Store", -2500), tx("2026-09-12", "Hardware Store", -2500), tx("2026-10-20", "Hardware Store", -2500)])).toEqual([]);
  });

  it("drops a payment that stopped (last sighting too long ago)", () => {
    expect(run([tx("2026-07-03", "Old Gym", -4000), tx("2026-08-03", "Old Gym", -4000), tx("2026-09-03", "Old Gym", -4000)])).toEqual([]);
  });

  it("keeps money in and money out apart", () => {
    const out = run([tx("2026-09-03", "Venmo", -2000), tx("2026-10-03", "Venmo", 2000)]);
    expect(out).toEqual([]);
  });

  it("counts several charges on one day as a single sighting", () => {
    const out = run([tx("2026-10-03", "Parking", -500), tx("2026-10-03", "Parking", -500)]);
    expect(out).toEqual([]);
  });

  it("ignores zero amounts and future-dated rows", () => {
    expect(run([tx("2026-09-03", "Fee", 0), tx("2026-10-03", "Fee", 0)])).toEqual([]);
    expect(run([tx("2026-10-26", "Later", -1000), tx("2026-11-26", "Later", -1000)])).toEqual([]);
  });
});

describe("detectRecurring skips what is already tracked", () => {
  const netflix = [tx("2026-09-03", "NETFLIX.COM", -1549), tx("2026-10-03", "NETFLIX.COM", -1549)];

  it("matches by name", () => {
    expect(run(netflix, { bills: [existing({ name: "Netflix", amountCents: 999 })] })).toEqual([]);
  });

  it("matches a differently named item with the same amount on the same schedule", () => {
    const rent = [tx("2026-09-01", "ZELLE JANE LANDLORD", -120000), tx("2026-10-01", "ZELLE JANE LANDLORD", -120000)];
    const bills = [existing({ name: "Rent", amountCents: 120000, anchorDate: "2026-01-02" })];
    expect(run(rent, { bills })).toEqual([]);
  });

  it("does not match a different schedule with the same amount", () => {
    const bills = [existing({ name: "Something else", amountCents: 1549, anchorDate: "2026-01-20" })];
    expect(run(netflix, { bills })).toHaveLength(1);
  });

  it("only compares within the same kind", () => {
    expect(run(netflix, { incomes: [existing({ name: "Netflix" })] })).toHaveLength(1);
  });

  it("ignores ended and one-time items", () => {
    expect(run(netflix, { bills: [existing({ name: "Netflix", endDate: "2026-09-30" })] })).toHaveLength(1);
    expect(run(netflix, { bills: [existing({ name: "Netflix", frequency: "ONE_TIME" })] })).toHaveLength(1);
  });

  it("still counts paused items as tracked", () => {
    // Paused bills are passed in like any other: the user already decided about them.
    expect(run(netflix, { bills: [existing({ name: "netflix premium", amountCents: 1499 })] })).toEqual([]);
  });
});

describe("detectRecurring ordering", () => {
  it("sorts by next date, then income before bills, then name", () => {
    const out = run([
      tx("2026-09-10", "Zed Co", -1000),
      tx("2026-10-10", "Zed Co", -1000),
      tx("2026-09-10", "Alpha Co", -1000),
      tx("2026-10-10", "Alpha Co", -1000),
      tx("2026-09-10", "Refund Club", 1000),
      tx("2026-10-10", "Refund Club", 1000),
      tx("2026-09-05", "Early Co", -500),
      tx("2026-10-05", "Early Co", -500),
    ]);
    expect(out.map((s) => s.name)).toEqual(["Early Co", "Refund Club", "Alpha Co", "Zed Co"]);
  });
});


describe("detectRecurring credit card payments", () => {
  const pay = (date: string, cents: number, description = "CHASE CREDIT CRD AUTOPAY 12345") => tx(date, description, -cents);

  it("predicts the date of a card payment whose amount changes every month", () => {
    const [s] = run([pay("2026-09-18", 41230), pay("2026-10-18", 87615)]);
    expect(s).toMatchObject({ kind: "BILL", frequency: "MONTHLY", nextDate: "2026-11-18", amountCents: 87615, cardPayment: true, amountVaries: true });
  });

  it("recognizes other issuers' wording", () => {
    for (const description of ["AMEX EPAYMENT ACH PMT", "DISCOVER E-PAYMENT", "CAPITAL ONE CARD PMT", "CITI CARD ONLINE PAYMENT"]) {
      const out = run([pay("2026-09-05", 10000, description), pay("2026-10-05", 90000, description)]);
      expect(out[0], description).toMatchObject({ cardPayment: true, frequency: "MONTHLY", nextDate: "2026-11-05" });
    }
  });

  it("still rejects an ordinary payment whose amount jumps between two sightings", () => {
    expect(run([pay("2026-09-18", 41230, "CITY WATER"), pay("2026-10-18", 87615, "CITY WATER")])).toEqual([]);
  });

  it("never treats money coming in as a card payment", () => {
    const [s] = run([tx("2026-09-18", "CHASE CREDIT CRD REFUND", 1000), tx("2026-10-18", "CHASE CREDIT CRD REFUND", 1000)]);
    expect(s).toMatchObject({ kind: "INCOME", cardPayment: false });
  });

  it("does not stretch a weekly or biweekly pattern: only monthly card payments are predicted", () => {
    expect(run([pay("2026-10-02", 1000), pay("2026-10-09", 9000), pay("2026-10-16", 4000)])).toEqual([]);
  });
});
