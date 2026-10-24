import { describe, expect, it } from "vitest";
import {
  decimalStringToCents,
  tellerAmountToSignedCents,
  toBankAccountDTO,
  toBankTransactionDTO,
  type TellerTransaction,
} from "@/server/teller-mapping";

describe("decimalStringToCents", () => {
  it.each([
    ["12.99", 1299],
    ["-12.99", -1299],
    ["+3", 300],
    ["0.07", 7],
    ["-0.05", -5],
    ["5", 500],
    ["5.5", 550],
    [".5", 50],
    ["-0", 0],
    ["0.10", 10],
    ["1234567.89", 123456789],
    ["19.999", 2000],
    ["19.994", 1999],
    ["-19.995", -2000],
  ])("parses %s → %d", (input, cents) => {
    expect(decimalStringToCents(input)).toBe(cents);
  });

  it("is exact where floats are not (0.1 + 0.2 style values)", () => {
    expect(decimalStringToCents("0.29")).toBe(29);
    expect(decimalStringToCents("1.15")).toBe(115);
    expect(decimalStringToCents("4.35")).toBe(435);
  });

  it.each(["", "-", ".", "abc", "1,000.00", "$5", "1e3", "1.2.3"])("rejects %j", (input) => {
    expect(decimalStringToCents(input)).toBeNull();
  });
});

describe("tellerAmountToSignedCents", () => {
  it("keeps the sign: money in positive, money out negative", () => {
    expect(tellerAmountToSignedCents("2500.00")).toBe(250000);
    expect(tellerAmountToSignedCents("-42.18")).toBe(-4218);
  });

  it("throws on an unrecognized amount rather than guessing", () => {
    expect(() => tellerAmountToSignedCents("n/a")).toThrow(/Unrecognized Teller amount/);
  });
});

describe("DTO mapping", () => {
  const tx: TellerTransaction = {
    id: "txn_1",
    account_id: "acc_1",
    date: "2026-10-20",
    description: "SQ *BLUE BOTTLE 0123",
    amount: "-6.50",
    status: "pending",
    details: { category: "dining", counterparty: { name: "Blue Bottle", type: "organization" } },
  };

  it("maps a transaction", () => {
    expect(toBankTransactionDTO(tx)).toEqual({
      id: "txn_1",
      accountId: "acc_1",
      date: "2026-10-20",
      description: "SQ *BLUE BOTTLE 0123",
      counterparty: "Blue Bottle",
      category: "dining",
      amountCents: -650,
      pending: true,
    });
  });

  it("handles missing details and posted status", () => {
    const dto = toBankTransactionDTO({ ...tx, status: "posted", details: null, amount: "10.00" });
    expect(dto).toMatchObject({ counterparty: null, category: null, pending: false, amountCents: 1000 });
  });

  it("maps an account without leaking Teller's snake_case or links", () => {
    expect(
      toBankAccountDTO({
        id: "acc_1",
        enrollment_id: "enr_1",
        institution: { id: "td_bank", name: "TD Bank" },
        name: "TD Checking",
        type: "depository",
        subtype: "checking",
        last_four: "1234",
        currency: "USD",
        status: "open",
      }),
    ).toEqual({ id: "acc_1", name: "TD Checking", type: "depository", subtype: "checking", lastFour: "1234", currency: "USD", status: "open" });
  });
});
