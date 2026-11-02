import { describe, expect, it } from "vitest";
import { aprToInputText, parseAprInput } from "@/domain/apr";
import { estimateMinimumPaymentCents } from "@/domain/debt-payoff";

describe("parseAprInput", () => {
  it("converts a percent to basis points", () => {
    expect(parseAprInput("19.99")).toEqual({ ok: true, basisPoints: 1999 });
    expect(parseAprInput(" 24 ")).toEqual({ ok: true, basisPoints: 2400 });
    expect(parseAprInput("0")).toEqual({ ok: true, basisPoints: 0 });
  });

  it("treats blank as no APR", () => {
    expect(parseAprInput("  ")).toEqual({ ok: true, basisPoints: null });
  });

  it("rejects malformed or out-of-range input", () => {
    for (const bad of ["abc", "-5", "1.234", "1,5", "1000.01", "19.99%"]) {
      expect(parseAprInput(bad)).toEqual({ ok: false });
    }
  });
});

describe("aprToInputText", () => {
  it("round-trips basis points and blank", () => {
    expect(aprToInputText(1999)).toBe("19.99");
    expect(aprToInputText(null)).toBe("");
  });
});

describe("estimateMinimumPaymentCents", () => {
  it("is 2% of balance with a $25 floor, capped at the balance", () => {
    expect(estimateMinimumPaymentCents(300000)).toBe(6000);
    expect(estimateMinimumPaymentCents(100000)).toBe(2500);
    expect(estimateMinimumPaymentCents(1800)).toBe(1800);
  });
});
