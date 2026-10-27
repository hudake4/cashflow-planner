import { describe, expect, it } from "vitest";
import type { DaySummary, LedgerEvent } from "@/contracts/api";
import { findLowPointBills } from "@/domain/low-point";

const days = (closing: [string, number][], opening = 10000): DaySummary[] => {
  let prior = opening;
  return closing.map(([date, close]) => {
    const day = { date, openingBalanceCents: prior, incomeCents: 0, billsCents: 0, netCents: close - prior, closingBalanceCents: close, eventIds: [] };
    prior = close;
    return day;
  });
};
const event = (id: string, kind: "INCOME" | "BILL", date: string, amountCents: number, included = true, name = id): LedgerEvent => ({
  id, date, kind, sourceId: kind === "BILL" ? id.split(":")[1] : id, name, amountCents,
  signedAmountCents: kind === "INCOME" ? amountCents : -amountCents,
  balanceAfterCents: 0, sequence: 0, included, status: kind === "BILL" ? "UPCOMING" : undefined,
  frequency: kind === "BILL" ? "ONE_TIME" : undefined, amountOverridden: false,
} as LedgerEvent);

describe("findLowPointBills", () => {
  const closing: [string, number][] = [["2025-01-01", 9000], ["2025-01-02", 7000], ["2025-01-03", 5000], ["2025-01-04", 7000], ["2025-01-05", 9000]];

  it("lists bills before the next payday in moved-low order with cents and dates", () => {
    const result = findLowPointBills({ days: days(closing), referenceDate: "2025-01-01", events: [
      event("pay", "INCOME", "2025-01-05", 5000),
      event("BILL:small:2025-01-02", "BILL", "2025-01-02", 2000, true, "Small"),
      event("BILL:large:2025-01-01", "BILL", "2025-01-01", 3000, true, "Large"),
    ] });
    expect(result).toEqual({ lowestBalanceCents: 5000, lowestBalanceDate: "2025-01-03", nextPayday: "2025-01-05", bills: [
      { eventId: "BILL:large:2025-01-01", billId: "large", name: "Large", date: "2025-01-01", amountCents: 3000, movedLowestBalanceCents: 8000, movedLowestBalanceDate: "2025-01-03" },
      { eventId: "BILL:small:2025-01-02", billId: "small", name: "Small", date: "2025-01-02", amountCents: 2000, movedLowestBalanceCents: 7000, movedLowestBalanceDate: "2025-01-03" },
    ] });
  });

  it("excludes a move that does not raise the low and returns null without later income", () => {
    const tiedLowDays = days([["2025-01-01", 5000], ["2025-01-02", 10000], ["2025-01-03", 5000], ["2025-01-04", 10000]], 10000);
    const tiedLow = { days: tiedLowDays, referenceDate: "2025-01-01", events: [
      event("BILL:a:2025-01-01", "BILL", "2025-01-01", 5000),
      event("pay-1", "INCOME", "2025-01-02", 5000),
      event("BILL:b:2025-01-03", "BILL", "2025-01-03", 5000),
      event("pay-2", "INCOME", "2025-01-04", 5000),
    ] };
    expect(findLowPointBills(tiedLow)).toBeNull();

    const noLaterIncome = { days: days([["2025-01-01", 4500], ["2025-01-02", 6000], ["2025-01-03", 7000]], 5000), referenceDate: "2025-01-01", events: [
      event("BILL:tiny:2025-01-01", "BILL", "2025-01-01", 100),
    ] };
    expect(findLowPointBills(noLaterIncome)).toBeNull();
  });

  it("excludes past and skipped bills", () => {
    expect(findLowPointBills({ days: days(closing), referenceDate: "2025-01-03", events: [
      event("pay", "INCOME", "2025-01-05", 5000),
      event("BILL:past:2025-01-02", "BILL", "2025-01-02", 4000),
      event("BILL:skip:2025-01-03", "BILL", "2025-01-03", 4000, false),
    ] })).toBeNull();
  });

  it("preserves opening-balance attribution and can move the low to an earlier date", () => {
    const result = findLowPointBills({ days: days([["2025-01-01", 8000], ["2025-01-02", 6000], ["2025-01-03", 7000], ["2025-01-04", 9000]], 7000), referenceDate: "2025-01-01", events: [
      event("pay", "INCOME", "2025-01-04", 5000),
      event("BILL:b:2025-01-02", "BILL", "2025-01-02", 3000),
    ] });
    expect(result?.lowestBalanceDate).toBe("2025-01-02");
    expect(result?.bills[0]).toMatchObject({ movedLowestBalanceCents: 7000, movedLowestBalanceDate: "2025-01-01" });
  });
});
