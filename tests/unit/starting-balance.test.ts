import { describe, expect, it } from "vitest";
import { effectiveProjectionStartDate, effectiveStartingBalanceCents, startDateFromAccounts } from "@/domain/starting-balance";

const base = {
  startingBalanceCents: 100000,
  startingBalanceSource: "MANUAL" as const,
  accountsBalanceCents: 525000 as number | null,
  accountsBalanceDate: "2026-10-20" as string | null,
  projectionStartDate: "2026-10-01",
};

describe("effectiveStartingBalanceCents", () => {
  it("uses the typed balance for MANUAL and the accounts' total for ACCOUNTS", () => {
    expect(effectiveStartingBalanceCents(base)).toBe(100000);
    expect(effectiveStartingBalanceCents({ ...base, startingBalanceSource: "ACCOUNTS" })).toBe(525000);
  });

  it("falls back to the typed balance when no account is summed", () => {
    expect(effectiveStartingBalanceCents({ ...base, startingBalanceSource: "ACCOUNTS", accountsBalanceCents: null })).toBe(100000);
  });
});

describe("effectiveProjectionStartDate", () => {
  it("uses the typed date for MANUAL, whatever the accounts say", () => {
    expect(effectiveProjectionStartDate(base)).toBe("2026-10-01");
    expect(startDateFromAccounts(base)).toBe(false);
  });

  it("uses the oldest bank balance date for ACCOUNTS, even when it is before or after the typed date", () => {
    const accounts = { ...base, startingBalanceSource: "ACCOUNTS" as const };
    expect(effectiveProjectionStartDate(accounts)).toBe("2026-10-20");
    expect(effectiveProjectionStartDate({ ...accounts, accountsBalanceDate: "2026-09-15" })).toBe("2026-09-15");
    expect(startDateFromAccounts(accounts)).toBe(true);
  });

  it("keeps the typed date for ACCOUNTS while no bank account is summed", () => {
    const none = { ...base, startingBalanceSource: "ACCOUNTS" as const, accountsBalanceCents: null, accountsBalanceDate: null };
    expect(effectiveProjectionStartDate(none)).toBe("2026-10-01");
    expect(startDateFromAccounts(none)).toBe(false);
  });
});
