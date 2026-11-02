import { describe, expect, it } from "vitest";
import { matchBillPayments, type MatchBill, type MatchInput, type MatchOccurrence, type MatchTransaction } from "@/domain/bill-match";

const TODAY = "2026-10-24";

const bill = (over: Partial<MatchBill> = {}): MatchBill => ({
  id: "b-netflix",
  name: "Netflix",
  amountCents: 1549,
  frequency: "MONTHLY",
  anchorDate: "2026-01-03",
  endDate: null,
  active: true,
  ...over,
});
const tx = (over: Partial<MatchTransaction> = {}): MatchTransaction => ({
  id: "t1",
  date: "2026-10-03",
  description: "NETFLIX.COM 1234",
  amountCents: -1549,
  ...over,
});
const occ = (over: Partial<MatchOccurrence> = {}): MatchOccurrence => ({
  billId: "b-netflix",
  dueDate: "2026-10-03",
  status: "UPCOMING",
  amountOverrideCents: null,
  note: null,
  ...over,
});
const run = (over: Partial<MatchInput> = {}) =>
  matchBillPayments({ transactions: [tx()], bills: [bill()], occurrences: [], today: TODAY, ...over });

describe("matchBillPayments", () => {
  it("offers an exact merchant, amount and date match", () => {
    expect(run()).toEqual([
      {
        billId: "b-netflix",
        billName: "Netflix",
        dueDate: "2026-10-03",
        expectedCents: 1549,
        amountOverrideCents: null,
        note: null,
        transaction: { id: "t1", date: "2026-10-03", description: "NETFLIX.COM 1234", cents: 1549 },
      },
    ]);
  });

  it("returns nothing without transactions or bills", () => {
    expect(run({ transactions: [] })).toEqual([]);
    expect(run({ bills: [] })).toEqual([]);
  });

  describe("date tolerance", () => {
    it.each(["2026-09-30", "2026-10-06"])("accepts a payment 3 days from the due date (%s)", (date) => {
      expect(run({ transactions: [tx({ date })] })).toHaveLength(1);
    });

    it.each(["2026-09-29", "2026-10-07"])("rejects a payment 4 days from the due date (%s)", (date) => {
      expect(run({ transactions: [tx({ date })] })).toEqual([]);
    });

    it("matches an occurrence that is due a day after today when the bank posted early", () => {
      const out = run({
        transactions: [tx({ date: TODAY })],
        bills: [bill({ anchorDate: "2026-10-25" })],
      });
      expect(out.map((m) => m.dueDate)).toEqual(["2026-10-25"]);
    });

    it("ignores transactions dated after today", () => {
      expect(run({ transactions: [tx({ date: "2026-10-25" })], bills: [bill({ anchorDate: "2026-10-25" })] })).toEqual([]);
    });
  });

  describe("amount tolerance", () => {
    it("accepts an amount exactly 10% off", () => {
      expect(run({ bills: [bill({ amountCents: 10000 })], transactions: [tx({ amountCents: -9000 })] })).toHaveLength(1);
      expect(run({ bills: [bill({ amountCents: 9000 })], transactions: [tx({ amountCents: -10000 })] })).toHaveLength(1);
    });

    it("rejects an amount more than 10% off", () => {
      expect(run({ bills: [bill({ amountCents: 10000 })], transactions: [tx({ amountCents: -8999 })] })).toEqual([]);
      expect(run({ bills: [bill({ amountCents: 10000 })], transactions: [tx({ amountCents: -11112 })] })).toEqual([]);
    });

    it("compares with the occurrence's amount override, not the bill's default", () => {
      const bills = [bill({ amountCents: 1549 })];
      const transactions = [tx({ amountCents: -8400 })];
      expect(run({ bills, transactions })).toEqual([]);
      const [m] = run({ bills, transactions, occurrences: [occ({ amountOverrideCents: 8450, note: "Winter rate" })] });
      expect(m).toMatchObject({ expectedCents: 8450, amountOverrideCents: 8450, note: "Winter rate" });
      expect(m.transaction.cents).toBe(8400);
    });
  });

  describe("merchant", () => {
    it("ignores a different merchant with the same amount and date", () => {
      expect(run({ transactions: [tx({ description: "HULU 800-555-0100" })] })).toEqual([]);
    });

    it("ignores bank boilerplate and reference numbers", () => {
      expect(run({ transactions: [tx({ description: "POS DEBIT NETFLIX.COM #8841" })] })).toHaveLength(1);
    });

    it("accepts a shared first word of 5+ letters, as the recurring scan does", () => {
      const premium = bill({ name: "Netflix Premium" });
      expect(run({ bills: [premium], transactions: [tx({ description: "NETFLIX.COM" })] })).toHaveLength(1);
      expect(run({ bills: [bill({ name: "Gym membership" })], transactions: [tx({ description: "GYMNASIUM SUPPLY" })] })).toEqual([]);
    });

    it("never matches money in", () => {
      expect(run({ transactions: [tx({ amountCents: 1549 })] })).toEqual([]);
    });
  });

  describe("occurrence state", () => {
    it("skips occurrences already marked paid", () => {
      expect(run({ occurrences: [occ({ status: "PAID" })] })).toEqual([]);
    });

    it("skips occurrences marked skipped", () => {
      expect(run({ occurrences: [occ({ status: "SKIPPED" })] })).toEqual([]);
    });

    it("still offers an occurrence that has a row but is UPCOMING", () => {
      expect(run({ occurrences: [occ({ status: "UPCOMING", amountOverrideCents: 1549 })] })).toHaveLength(1);
    });

    it("only a paid occurrence is dropped: the next month's payment is still offered", () => {
      const out = run({
        bills: [bill()],
        transactions: [tx({ id: "t-sep", date: "2026-09-03" }), tx({ id: "t-oct", date: "2026-10-03" })],
        occurrences: [occ({ dueDate: "2026-09-03", status: "PAID" })],
      });
      expect(out.map((m) => [m.dueDate, m.transaction.id])).toEqual([["2026-10-03", "t-oct"]]);
    });

    it("ignores inactive bills", () => {
      expect(run({ bills: [bill({ active: false })] })).toEqual([]);
    });

    it("ignores dates that are not scheduled (before the anchor, after the end date)", () => {
      expect(run({ bills: [bill({ anchorDate: "2026-11-03" })] })).toEqual([]);
      expect(run({ bills: [bill({ endDate: "2026-09-30" })] })).toEqual([]);
    });

    it("handles one-time and weekly bills", () => {
      expect(run({ bills: [bill({ frequency: "ONE_TIME", anchorDate: "2026-10-03" })] })).toHaveLength(1);
      const weekly = bill({ frequency: "WEEKLY", anchorDate: "2026-10-02", name: "Lawn Service", id: "b-lawn", amountCents: 6000 });
      const out = run({
        bills: [weekly],
        transactions: [
          tx({ id: "w1", date: "2026-10-09", description: "LAWN SERVICE", amountCents: -6000 }),
          tx({ id: "w2", date: "2026-10-17", description: "LAWN SERVICE", amountCents: -6000 }),
        ],
      });
      expect(out.map((m) => [m.dueDate, m.transaction.id])).toEqual([
        ["2026-10-09", "w1"],
        ["2026-10-16", "w2"],
      ]);
    });
  });

  describe("ambiguity", () => {
    it("uses each transaction once: two same-day charges for one occurrence offer only the first by id", () => {
      const out = run({ transactions: [tx({ id: "t2" }), tx({ id: "t1" })] });
      expect(out.map((m) => m.transaction.id)).toEqual(["t1"]);
    });

    it("pairs each of two same-merchant bills with the charge that fits its amount", () => {
      const bills = [
        bill({ id: "b-a", name: "Phone line A", amountCents: 4000, anchorDate: "2026-10-05" }),
        bill({ id: "b-b", name: "Phone line B", amountCents: 6500, anchorDate: "2026-10-05" }),
      ];
      const transactions = [
        tx({ id: "t-65", date: "2026-10-05", description: "PHONE CO", amountCents: -6500 }),
        tx({ id: "t-40", date: "2026-10-05", description: "PHONE CO", amountCents: -4000 }),
      ];
      const out = run({ bills, transactions });
      expect(out.map((m) => [m.billId, m.transaction.id])).toEqual([
        ["b-a", "t-40"],
        ["b-b", "t-65"],
      ]);
    });

    it("prefers the closer date when one charge fits two occurrences of different bills", () => {
      const bills = [
        bill({ id: "b-a", name: "Internet", amountCents: 5000, anchorDate: "2026-10-04" }),
        bill({ id: "b-b", name: "Internet backup", amountCents: 5000, anchorDate: "2026-10-06" }),
      ];
      const out = run({ bills, transactions: [tx({ date: "2026-10-04", description: "INTERNET", amountCents: -5000 })] });
      expect(out.map((m) => m.billId)).toEqual(["b-a"]);
    });

    it("offers nothing when one charge fits two different bills equally well", () => {
      const bills = [
        bill({ id: "b-a", name: "Internet", amountCents: 5000, anchorDate: "2026-10-04" }),
        bill({ id: "b-b", name: "Internet", amountCents: 5000, anchorDate: "2026-10-04" }),
      ];
      expect(run({ bills, transactions: [tx({ date: "2026-10-04", description: "INTERNET", amountCents: -5000 })] })).toEqual([]);
    });

    it("an ambiguous charge doesn't block an unrelated one", () => {
      const bills = [
        bill({ id: "b-a", name: "Internet", amountCents: 5000, anchorDate: "2026-10-04" }),
        bill({ id: "b-b", name: "Internet", amountCents: 5000, anchorDate: "2026-10-04" }),
        bill(),
      ];
      const out = run({
        bills,
        transactions: [tx({ id: "t-net", date: "2026-10-04", description: "INTERNET", amountCents: -5000 }), tx()],
      });
      expect(out.map((m) => m.billId)).toEqual(["b-netflix"]);
    });
  });

  it("orders offers by due date, then bill name", () => {
    const bills = [
      bill({ id: "b-z", name: "Zeta", anchorDate: "2026-10-10", amountCents: 2000 }),
      bill({ id: "b-a", name: "Alpha", anchorDate: "2026-10-10", amountCents: 2000 }),
      bill({ id: "b-m", name: "Mid", anchorDate: "2026-10-02", amountCents: 2000 }),
    ];
    const transactions = [
      tx({ id: "1", date: "2026-10-10", description: "ZETA", amountCents: -2000 }),
      tx({ id: "2", date: "2026-10-10", description: "ALPHA", amountCents: -2000 }),
      tx({ id: "3", date: "2026-10-02", description: "MID", amountCents: -2000 }),
    ];
    expect(run({ bills, transactions }).map((m) => m.billName)).toEqual(["Mid", "Alpha", "Zeta"]);
  });
});
