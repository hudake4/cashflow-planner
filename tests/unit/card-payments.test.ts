import { describe, expect, it } from "vitest";
import type { AccountKind } from "@/contracts/api";
import { matchCardPayments, type PaymentCandidate } from "@/domain/card-payments";

const t = (id: string, accountKind: AccountKind, date: string, amountCents: number): PaymentCandidate => ({ id, accountKind, date, amountCents });

describe("matchCardPayments", () => {
  it("matches a bank debit with the same amount received on a credit account", () => {
    const paid = matchCardPayments([t("bank", "BANK", "2026-10-03", -120000), t("card", "CREDIT", "2026-10-03", 120000)]);
    expect([...paid]).toEqual(["bank"]);
  });

  it("allows the two sides to post a few days apart, in either order, but not further", () => {
    expect(matchCardPayments([t("b", "BANK", "2026-10-03", -5000), t("c", "CREDIT", "2026-10-08", 5000)]).has("b")).toBe(true);
    expect(matchCardPayments([t("b", "BANK", "2026-10-08", -5000), t("c", "CREDIT", "2026-10-03", 5000)]).has("b")).toBe(true);
    expect(matchCardPayments([t("b", "BANK", "2026-10-03", -5000), t("c", "CREDIT", "2026-10-09", 5000)]).size).toBe(0);
  });

  it("needs the exact amount", () => {
    expect(matchCardPayments([t("b", "BANK", "2026-10-03", -5000), t("c", "CREDIT", "2026-10-03", 5001)]).size).toBe(0);
  });

  it("leaves refunds on a card and ordinary card purchases alone", () => {
    const paid = matchCardPayments([
      t("purchase", "CREDIT", "2026-10-03", -5000),
      t("debit", "BANK", "2026-10-03", -5000),
      t("deposit", "BANK", "2026-10-03", 5000),
    ]);
    expect(paid.size).toBe(0);
  });

  it("ignores transfers between bank accounts and money in on loans or other accounts", () => {
    const paid = matchCardPayments([
      t("out", "BANK", "2026-10-03", -5000),
      t("in", "BANK", "2026-10-03", 5000),
      t("loan", "LOAN", "2026-10-03", 5000),
      t("other", "OTHER", "2026-10-03", 5000),
    ]);
    expect(paid.size).toBe(0);
  });

  it("pairs each card receipt with one debit only, the closest in date first", () => {
    const paid = matchCardPayments([
      t("far", "BANK", "2026-10-01", -5000),
      t("near", "BANK", "2026-10-04", -5000),
      t("card", "CREDIT", "2026-10-05", 5000),
    ]);
    expect([...paid]).toEqual(["near"]);
  });

  it("matches two equal payments to their own receipts", () => {
    const paid = matchCardPayments([
      t("b1", "BANK", "2026-09-03", -5000),
      t("b2", "BANK", "2026-10-03", -5000),
      t("c1", "CREDIT", "2026-09-04", 5000),
      t("c2", "CREDIT", "2026-10-04", 5000),
    ]);
    expect([...paid].sort()).toEqual(["b1", "b2"]);
  });
});
