import { describe, expect, it } from "vitest";
import { compactBalance, heatBackground, heatTint } from "@/lib/calendar-heatmap";

describe("compactBalance", () => {
  it("shows whole dollars with separators below $10,000", () => {
    expect(compactBalance(0)).toBe("$0");
    expect(compactBalance(26544)).toBe("$265");
    expect(compactBalance(133000)).toBe("$1,330");
    expect(compactBalance(999_949)).toBe("$9,999");
  });

  it("switches to k and M style from $10,000", () => {
    expect(compactBalance(1_000_000)).toBe("$10k");
    expect(compactBalance(1_250_000)).toBe("$12.5k");
    expect(compactBalance(12_500_000)).toBe("$125k");
    expect(compactBalance(99_960_000)).toBe("$1M");
    expect(compactBalance(123_000_000)).toBe("$1.2M");
  });

  it("puts a true minus sign before negative balances", () => {
    expect(compactBalance(-27000)).toBe("−$270");
    expect(compactBalance(-99_900)).toBe("−$999");
  });

  it("abbreviates negative balances from $1,000 so the minus sign still fits", () => {
    expect(compactBalance(-100_000)).toBe("−$1k");
    expect(compactBalance(-123_400)).toBe("−$1.2k");
    expect(compactBalance(-999_000)).toBe("−$10k");
  });

  it("keeps whole thousands for negative balances of $10,000 or more", () => {
    expect(compactBalance(-1_234_500)).toBe("−$12k");
    expect(compactBalance(-1_250_000)).toBe("−$13k");
    expect(compactBalance(-12_345_600)).toBe("−$123k");
    expect(compactBalance(-123_456_789)).toBe("−$1.2M");
    expect(compactBalance(-1_234_567_890)).toBe("−$12M");
  });

  it("keeps the decimal for large positive balances", () => {
    expect(compactBalance(1_250_000)).toBe("$12.5k");
    expect(compactBalance(25_000_000)).toBe("$250k");
  });

  it("does not show a minus for a negative balance that rounds to zero", () => {
    expect(compactBalance(-20)).toBe("$0");
    expect(compactBalance(-20, "USD", true)).toBe("0");
  });

  it("tight mode drops the currency symbol and abbreviates from $1,000 so it fits a phone cell", () => {
    expect(compactBalance(99_900, "USD", true)).toBe("999");
    expect(compactBalance(133_000, "USD", true)).toBe("1.3k");
    expect(compactBalance(100_000, "USD", true)).toBe("1k");
    expect(compactBalance(-99_900, "USD", true)).toBe("−999");
    expect(compactBalance(-133_000, "USD", true)).toBe("−1.3k");
    expect(compactBalance(-1_234_500, "USD", true)).toBe("−12k");
    expect(compactBalance(-12_345_600, "USD", true)).toBe("−123k");
    expect(compactBalance(-123_456_789, "USD", true)).toBe("−1.2M");
    expect(compactBalance(1_250_000, "USD", true)).toBe("12.5k");
    expect(compactBalance(25_000_000, "USD", true)).toBe("250k");
  });

  it("never yields more than seven characters, so it fits a phone cell with room for padding", () => {
    const samples = [0, 5, 99_900, 133_000, 999_949, 1_000_000, 1_250_000, 12_345_600, 99_960_000, 123_456_789, 1_234_567_890, 99_999_999_900];
    for (const cents of samples) {
      for (const signed of [cents, -cents]) {
        expect(compactBalance(signed).length).toBeLessThanOrEqual(7);
        expect(compactBalance(signed, "USD", true).length).toBeLessThanOrEqual(6);
      }
    }
  });

  it("uses the currency symbol", () => {
    expect(compactBalance(133000, "EUR")).toBe("€1,330");
    expect(compactBalance(1_250_000, "GBP")).toBe("£12.5k");
  });
});

describe("heatTint", () => {
  it("scales positive balances against the highest positive balance in view", () => {
    const low = heatTint(10_000, 400_000);
    const mid = heatTint(200_000, 400_000);
    const high = heatTint(400_000, 400_000);
    expect(low.tone).toBe("positive");
    expect(low.alpha).toBeLessThan(mid.alpha);
    expect(mid.alpha).toBeLessThan(high.alpha);
    expect(heatTint(900_000, 400_000).alpha).toBe(high.alpha);
  });

  it("falls back to the quietest tint when nothing is positive", () => {
    expect(heatTint(0, 0).alpha).toBe(heatTint(0, 400_000).alpha);
    expect(heatTint(0, 0).tone).toBe("positive");
  });

  it("gives every negative balance one stronger rose tint", () => {
    const negative = heatTint(-1, 400_000);
    expect(negative.tone).toBe("negative");
    expect(negative).toEqual(heatTint(-900_000, 400_000));
    expect(negative.alpha).toBeGreaterThan(heatTint(400_000, 400_000).alpha);
  });
});

describe("heatBackground", () => {
  it("mixes the palette variable so the tint follows light and dark", () => {
    expect(heatBackground({ tone: "positive", alpha: 0.2 })).toBe("color-mix(in srgb, var(--color-emerald-700) 20%, transparent)");
    expect(heatBackground({ tone: "negative", alpha: 0.3 })).toBe("color-mix(in srgb, var(--color-rose-600) 30%, transparent)");
  });
});
