import { describe, expect, it } from "vitest";
import type { BillDTO, RecurringSuggestionDTO } from "@/contracts/api";
import { annualCostCents, buildSubscriptionAudit, isCancelCandidate } from "@/domain/subscriptions";

const TODAY = "2026-10-24";

const suggestion = (over: Partial<RecurringSuggestionDTO> = {}): RecurringSuggestionDTO => ({
  key: "BILL:netflix com",
  kind: "BILL",
  name: "Netflix.com",
  amountCents: 1549,
  frequency: "MONTHLY",
  nextDate: "2026-11-03",
  occurrences: 2,
  seenDates: ["2026-09-03", "2026-10-03"],
  amountVaries: false,
  ...over,
});

const bill = (over: Partial<BillDTO> = {}): BillDTO => ({
  id: "b1",
  name: "Rent",
  amountCents: 120000,
  frequency: "MONTHLY",
  anchorDate: "2026-01-02",
  endDate: null,
  category: null,
  notes: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("annualCostCents", () => {
  it("multiplies by the cadence", () => {
    expect(annualCostCents(1000, "WEEKLY")).toBe(52_000);
    expect(annualCostCents(1000, "BIWEEKLY")).toBe(26_000);
    expect(annualCostCents(1000, "MONTHLY")).toBe(12_000);
    expect(annualCostCents(1000, "QUARTERLY")).toBe(4_000);
    expect(annualCostCents(1000, "YEARLY")).toBe(1_000);
    expect(annualCostCents(1000, "ONE_TIME")).toBe(1_000);
  });
});

describe("isCancelCandidate", () => {
  it("does not flag a monthly bill on its due date (idle 31 days)", () => {
    expect(isCancelCandidate("MONTHLY", 31)).toBe(false);
  });

  it("flags a monthly charge idle past its interval plus grace", () => {
    expect(isCancelCandidate("MONTHLY", 38)).toBe(true);
  });

  it("uses a short grace for weekly and biweekly charges", () => {
    expect(isCancelCandidate("WEEKLY", 11)).toBe(false);
    expect(isCancelCandidate("WEEKLY", 12)).toBe(true);
    expect(isCancelCandidate("BIWEEKLY", 21)).toBe(false);
    expect(isCancelCandidate("BIWEEKLY", 22)).toBe(true);
  });

  it("never flags an unknown frequency", () => {
    expect(isCancelCandidate("QUARTERLY", 1000)).toBe(false);
  });
});

describe("buildSubscriptionAudit", () => {
  it("excludes income suggestions from the rows and totals", () => {
    const income = suggestion({ key: "INCOME:acme", kind: "INCOME", name: "Acme Payroll", amountCents: 215000, frequency: "BIWEEKLY" });
    const audit = buildSubscriptionAudit({ suggestions: [suggestion(), income], tracked: [], today: TODAY });
    expect(audit.rows.map((r) => r.name)).toEqual(["Netflix.com"]);
    expect(audit.totalAnnualCostCents).toBe(1549 * 12);
  });

  it("includes the user's tracked bills, marked tracked", () => {
    const audit = buildSubscriptionAudit({ suggestions: [], tracked: [bill()], today: TODAY });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      source: "TRACKED",
      tracked: true,
      paused: false,
      name: "Rent",
      nextDate: "2026-11-02",
      annualCostCents: 120000 * 12,
      cancelCandidate: false,
    });
  });

  it("skips one-time bills, which are not subscriptions", () => {
    const audit = buildSubscriptionAudit({ suggestions: [], tracked: [bill({ frequency: "ONE_TIME" })], today: TODAY });
    expect(audit.rows).toEqual([]);
  });

  it("keeps paused bills visible but out of the annual total", () => {
    const audit = buildSubscriptionAudit({ suggestions: [], tracked: [bill({ active: false })], today: TODAY });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].paused).toBe(true);
    expect(audit.rows[0].annualCostCents).toBe(0);
    expect(audit.totalAnnualCostCents).toBe(0);
  });

  it("sums detected charges and active tracked bills", () => {
    const audit = buildSubscriptionAudit({ suggestions: [suggestion()], tracked: [bill()], today: TODAY });
    expect(audit.totalAnnualCostCents).toBe(1549 * 12 + 120000 * 12);
  });

  it("flags only detected charges as cancel candidates", () => {
    // A monthly charge last seen 2026-09-15 is 39 days idle → cancel candidate.
    const stale = suggestion({ key: "BILL:gym", name: "Gym", seenDates: ["2026-08-15", "2026-09-15"], nextDate: "2026-10-15" });
    const audit = buildSubscriptionAudit({ suggestions: [stale], tracked: [bill()], today: TODAY });
    expect(audit.cancelCandidates.map((r) => r.name)).toEqual(["Gym"]);
    expect(audit.candidateAnnualCostCents).toBe(1549 * 12);
  });
});
