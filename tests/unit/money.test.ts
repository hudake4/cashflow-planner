import { describe, expect, it } from "vitest";
import { centsToDecimalString, centsToInputValue, formatCents, parseMoneyToCents, sumCents } from "@/domain/money";

// CONVENTIONS section 1: integer cents, string parsing (never parseFloat * 100).
describe("parseMoneyToCents", () => {
  it.each([
    ["12.99", 1299],
    ["0.1", 10],
    ["0.10", 10],
    [".5", 50],
    ["5.", 500],
    ["5", 500],
    ["$5", 500],
    ["$12.99", 1299],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["1,000,000", 100000000],
    ["10,000,000.00", 1000000000],
    ["  42.00  ", 4200],
    ["0", 0],
    ["0.07", 7],
    ["19.90", 1990],
    // classic float traps: parseFloat(x)*100 would give 1.1500000000000001*100 etc.
    ["1.15", 115],
    ["4.35", 435],
    ["0.29", 29],
  ])("parses %j -> %i cents", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["12.999", "abc", "", "   ", ".", "-", "1.2.3", "1e3", "1,23", "12,34.56", "$", "12a", "--5", "1 000x"])(
    "rejects %j",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );

  it("rejects negatives unless allowNegative", () => {
    expect(parseMoneyToCents("-50")).toBeNull();
    expect(parseMoneyToCents("-50", { allowNegative: true })).toBe(-5000);
    expect(parseMoneyToCents("-$5", { allowNegative: true })).toBe(-500);
    expect(parseMoneyToCents("-0.05", { allowNegative: true })).toBe(-5);
    expect(parseMoneyToCents("-1,234.56", { allowNegative: true })).toBe(-123456);
  });

  it('"-0" is plain zero (never negative zero)', () => {
    const v = parseMoneyToCents("-0", { allowNegative: true });
    expect(v).toBe(0);
    expect(Object.is(v, -0)).toBe(false);
    expect(Object.is(parseMoneyToCents("-0.00", { allowNegative: true }), -0)).toBe(false);
  });

  it("always returns an integer", () => {
    for (const s of ["0.01", "0.1", "0.29", "1.005".slice(0, 4), "99999.99", "123.4"]) {
      const v = parseMoneyToCents(s);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("centsToDecimalString / centsToInputValue", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [-5, "-0.05"],
    [1299, "12.99"],
    [120000, "1200.00"],
    [-123456, "-1234.56"],
    [1000000000, "10000000.00"],
  ])("%i -> %s", (cents, expected) => {
    expect(centsToDecimalString(cents)).toBe(expected);
    expect(centsToInputValue(cents)).toBe(expected);
  });

  it("throws on non-integer cents", () => {
    expect(() => centsToDecimalString(12.5)).toThrow();
  });

  it("round-trips with parseMoneyToCents", () => {
    for (const c of [0, 1, 9, 10, 99, 100, 1299, 123456, 99999999, 1000000000]) {
      expect(parseMoneyToCents(centsToInputValue(c))).toBe(c);
      expect(parseMoneyToCents(centsToInputValue(-c), { allowNegative: true })).toBe(-c === 0 ? 0 : -c);
    }
  });
});

describe("formatCents", () => {
  it("formats USD by default", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-5)).toBe("-$0.05");
    expect(formatCents(-123456)).toBe("-$1,234.56");
    expect(formatCents(1000000000)).toBe("$10,000,000.00");
  });

  it("supports signDisplay always", () => {
    expect(formatCents(100, { signDisplay: "always" })).toBe("+$1.00");
    expect(formatCents(-100, { signDisplay: "always" })).toBe("-$1.00");
  });

  it("uses the given currency", () => {
    expect(formatCents(1299, { currency: "EUR", locale: "en-US" })).toBe("€12.99");
  });

  it("formats exactly beyond float-safe decimals", () => {
    // 2^53 is not involved here, but a large cent value must not lose its last digit
    expect(formatCents(999999999)).toBe("$9,999,999.99");
  });
});

describe("sumCents", () => {
  it("sums integers exactly", () => {
    // $0.10 x 1000 = $100.00 exactly (floats would give 99.9999999...)
    expect(sumCents(Array(1000).fill(10))).toBe(10000);
    // $12.99 x 3 = $38.97
    expect(sumCents([1299, 1299, 1299])).toBe(3897);
    expect(sumCents([])).toBe(0);
    expect(sumCents([500, -200])).toBe(300);
  });

  it("throws on non-integer input", () => {
    expect(() => sumCents([1, 0.5])).toThrow();
  });
});
