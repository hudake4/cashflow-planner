import { describe, expect, it } from "vitest";
import { guessAccountKind } from "@/domain/account-kind";

describe("guessAccountKind", () => {
  it.each([
    ["Chase Credit Card", "CREDIT"],
    ["Visa credit  card", "CREDIT"],
    ["Home Equity Line of Credit", "CREDIT"],
    ["Personal Credit Line", "CREDIT"],
    ["HELOC", "CREDIT"],
    ["Auto Loan", "LOAN"],
    ["30 Year Mortgage", "LOAN"],
    ["Student LOAN", "LOAN"],
    ["Checking", "BANK"],
    ["Savings", "BANK"],
    ["Credit Union Checking", "BANK"],
    ["Visa Debit Card Checking", "BANK"],
    ["", "BANK"],
  ])("%j => %s", (name, kind) => {
    expect(guessAccountKind(name)).toBe(kind);
  });
});
