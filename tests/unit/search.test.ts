import { describe, expect, it } from "vitest";
import {
  RANK_CONTAINS,
  RANK_EXACT,
  RANK_PREFIX,
  RANK_WORD_PREFIX,
  SECONDARY_PENALTY,
  amountMatches,
  matchRank,
  normalizeQuery,
  parseAmountQuery,
  rankFields,
  selectTop,
} from "@/domain/search";

describe("normalizeQuery", () => {
  it("trims, lower-cases and collapses whitespace", () => {
    expect(normalizeQuery("  City   ELECTRIC ")).toBe("city electric");
  });

  it("drops accents", () => {
    expect(normalizeQuery("Café Rouge")).toBe("cafe rouge");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matchRank", () => {
  it("ranks exact, prefix, word prefix and contains in that order", () => {
    expect(matchRank("Rent", "rent")).toBe(RANK_EXACT);
    expect(matchRank("Rent payment", "rent")).toBe(RANK_PREFIX);
    expect(matchRank("Monthly rent", "rent")).toBe(RANK_WORD_PREFIX);
    expect(matchRank("Parent loan", "rent")).toBe(RANK_CONTAINS);
    expect(RANK_EXACT).toBeLessThan(RANK_PREFIX);
    expect(RANK_PREFIX).toBeLessThan(RANK_WORD_PREFIX);
    expect(RANK_WORD_PREFIX).toBeLessThan(RANK_CONTAINS);
  });

  it("is case and accent insensitive on the text side too", () => {
    expect(matchRank("CAFÉ ROUGE", "cafe")).toBe(RANK_PREFIX);
  });

  it("returns null for no match, empty text and an empty query", () => {
    expect(matchRank("Rent", "water")).toBeNull();
    expect(matchRank(null, "rent")).toBeNull();
    expect(matchRank("", "rent")).toBeNull();
    expect(matchRank("Rent", "")).toBeNull();
  });

  it("treats LIKE wildcards as plain characters", () => {
    expect(matchRank("Rent", "%")).toBeNull();
    expect(matchRank("50% off", "%")).toBe(RANK_CONTAINS);
    expect(matchRank("a_b", "_")).toBe(RANK_CONTAINS);
  });
});

describe("rankFields", () => {
  it("takes the best primary rank", () => {
    expect(rankFields("rent", ["Monthly rent", "Rent"])).toBe(RANK_EXACT);
  });

  it("penalises a match that is only in a secondary field", () => {
    expect(rankFields("rent", ["Landlord"], ["Rent"])).toBe(RANK_EXACT + SECONDARY_PENALTY);
  });

  it("ranks a weak name match above an exact note match", () => {
    const inName = rankFields("rent", ["Parent loan"], ["nothing"]);
    const inNotes = rankFields("rent", ["Landlord"], ["rent"]);
    expect(inName).not.toBeNull();
    expect(inNotes).not.toBeNull();
    expect(inName!).toBeLessThan(inNotes!);
  });

  it("returns null when no field matches", () => {
    expect(rankFields("rent", ["Water"], [null, "Utilities"])).toBeNull();
  });
});

describe("parseAmountQuery", () => {
  it("reads plain amounts as positive cents", () => {
    expect(parseAmountQuery("45.20")).toBe(4520);
    expect(parseAmountQuery("$45")).toBe(4500);
    expect(parseAmountQuery("1,200")).toBe(120000);
    expect(parseAmountQuery("0.5")).toBe(50);
  });

  it("ignores the sign", () => {
    expect(parseAmountQuery("-45.20")).toBe(4520);
    expect(parseAmountQuery("-$45")).toBe(4500);
  });

  it("returns null for text, dates, zero and more than two decimals", () => {
    expect(parseAmountQuery("rent")).toBeNull();
    expect(parseAmountQuery("2026-10-24")).toBeNull();
    expect(parseAmountQuery("0")).toBeNull();
    expect(parseAmountQuery("0.00")).toBeNull();
    expect(parseAmountQuery("12.345")).toBeNull();
    expect(parseAmountQuery("")).toBeNull();
  });
});

describe("amountMatches", () => {
  it("compares magnitudes, so a debit matches the amount people remember", () => {
    expect(amountMatches(-4520, 4520)).toBe(true);
    expect(amountMatches(4520, 4520)).toBe(true);
    expect(amountMatches(-4521, 4520)).toBe(false);
  });

  it("never matches without an amount query", () => {
    expect(amountMatches(0, null)).toBe(false);
    expect(amountMatches(-4520, null)).toBe(false);
  });
});

describe("selectTop", () => {
  const items = [
    { id: "a", rank: 3, name: "alpha" },
    { id: "b", rank: 1, name: "bravo" },
    { id: "c", rank: null, name: "charlie" },
    { id: "d", rank: 1, name: "delta" },
    { id: "e", rank: 0, name: "echo" },
  ];
  const rankOf = (i: (typeof items)[number]) => i.rank;
  const byName = (a: (typeof items)[number], b: (typeof items)[number]) => a.name.localeCompare(b.name);

  it("drops non-matches and sorts by rank, then by the tie-break", () => {
    expect(selectTop(items, rankOf, byName, 10).map((i) => i.id)).toEqual(["e", "b", "d", "a"]);
  });

  it("caps the result after sorting, so the best items survive", () => {
    expect(selectTop(items, rankOf, byName, 2).map((i) => i.id)).toEqual(["e", "b"]);
  });

  it("does not change the input order", () => {
    const before = items.map((i) => i.id);
    selectTop(items, rankOf, byName, 10);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});
