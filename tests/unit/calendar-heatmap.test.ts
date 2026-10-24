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
    expect(compactBalance(-1_250_000)).toBe("−$12.5k");
  });

  it("does not show a minus for a negative balance that rounds to zero", () => {
    expect(compactBalance(-20)).toBe("$0");
  });

  it("tight mode abbreviates from $1,000 so it fits a phone cell", () => {
    expect(compactBalance(99_900, "USD", true)).toBe("$999");
    expect(compactBalance(133_000, "USD", true)).toBe("$1.3k");
    expect(compactBalance(100_000, "USD", true)).toBe("$1k");
    expect(compactBalance(-133_000, "USD", true)).toBe("−$1.3k");
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
