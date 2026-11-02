import { describe, expect, it } from "vitest";
import { applyScenario, computeScenarioProjection } from "@/domain/scenario";
import { bill, income, input, occ } from "../helpers/fixtures";
import { assertReconciled } from "../helpers/invariants";

describe("applyScenario", () => {
  it("ADD_BILL appends a one-time bill with the resolved date and amount", () => {
    const base = input({ bills: [bill("rent", 20000, "MONTHLY", "2025-01-10")] });
    const next = applyScenario(base, { kind: "ADD_BILL", name: "Extra", amountCents: 5000, date: "2025-01-15" });

    expect(next.bills).toHaveLength(2);
    expect(next.bills[1]).toMatchObject({
      id: "scenario:bill:Extra:2025-01-15",
      name: "Extra",
      amountCents: 5000,
      frequency: "ONE_TIME",
      anchorDate: "2025-01-15",
    });
    // The original inputs are left untouched (pure transformation).
    expect(base.bills).toHaveLength(1);
  });

  it("ADD_INCOME appends a one-time income", () => {
    const base = input({ incomes: [income("pay", 50000, "BIWEEKLY", "2025-01-03")] });
    const next = applyScenario(base, { kind: "ADD_INCOME", name: "Bonus", amountCents: 10000, date: "2025-01-20" });

    expect(next.incomes).toHaveLength(2);
    expect(next.incomes[1]).toMatchObject({
      id: "scenario:income:Bonus:2025-01-20",
      name: "Bonus",
      amountCents: 10000,
      frequency: "ONE_TIME",
      anchorDate: "2025-01-20",
    });
  });

  it("REMOVE_BILL removes the bill and its occurrences", () => {
    const base = input({
      bills: [bill("rent", 20000, "MONTHLY", "2025-01-10")],
      occurrences: [occ("rent", "2025-01-10", "UPCOMING")],
    });
    const next = applyScenario(base, { kind: "REMOVE_BILL", id: "rent" });

    expect(next.bills).toHaveLength(0);
    expect(next.occurrences).toHaveLength(0);
  });

  it("REMOVE_INCOME removes only the matching income", () => {
    const base = input({
      incomes: [
        income("pay", 50000, "BIWEEKLY", "2025-01-03"),
        income("side", 10000, "MONTHLY", "2025-01-15"),
      ],
    });
    const next = applyScenario(base, { kind: "REMOVE_INCOME", id: "side" });

    expect(next.incomes.map((i) => i.id)).toEqual(["pay"]);
  });

  it("resolves the `amount` alias as cents", () => {
    const base = input();
    const next = applyScenario(base, { kind: "ADD_BILL", name: "Alias", amount: 4321, date: "2025-01-15" });
    expect(next.bills[0].amountCents).toBe(4321);
  });
});

describe("computeScenarioProjection", () => {
  it("reflects an added bill in the projection", () => {
    const base = input({ bills: [bill("rent", 20000, "ONE_TIME", "2025-01-10")] });
    const p = computeScenarioProjection(base, { kind: "ADD_BILL", name: "Extra", amountCents: 5000, date: "2025-01-15" });

    assertReconciled(p);
    expect(p.totals.billsCents).toBe(25000);
    expect(p.totals.endingBalanceCents).toBe(75000);
  });

  it("reflects a removed bill in the projection", () => {
    const base = input({ bills: [bill("rent", 20000, "ONE_TIME", "2025-01-10")] });
    const p = computeScenarioProjection(base, { kind: "REMOVE_BILL", id: "rent" });

    assertReconciled(p);
    expect(p.totals.billsCents).toBe(0);
    expect(p.totals.endingBalanceCents).toBe(100000);
  });
});
