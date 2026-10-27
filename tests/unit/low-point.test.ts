import { describe, expect, it } from "vitest";
import { buildLowPointInsight } from "@/domain/low-point";
import { computeProjection, type ProjectionInput } from "@/domain/projection";
import { bill, income, occ, settings } from "../helpers/fixtures";

const base = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  settings: settings({ projectionStartDate: "2025-01-01", forecastDays: 20, startingBalanceCents: 100000 }),
  incomes: [income("pay", 50000, "ONE_TIME", "2025-01-05", { name: "Payday" }), income("prior", 100, "ONE_TIME", "2025-01-02", { name: "Prior pay" })],
  bills: [bill("large", 80000, "ONE_TIME", "2025-01-04", { name: "Large bill" })],
  occurrences: [],
  ...over,
});

describe("buildLowPointInsight", () => {
  it("selects upcoming bills in the pay period and recomputes the moved low through the engine", () => {
    const input = base({ bills: [bill("large", 80000, "ONE_TIME", "2025-01-04", { name: "Large bill" }), bill("old", 1000, "ONE_TIME", "2025-01-01")] });
    const projection = computeProjection(input);
    const result = buildLowPointInsight(projection, input, "2025-01-01");
    expect(result).toMatchObject({ date: "2025-01-04", balanceCents: 19100, payday: { date: "2025-01-05", name: "Payday" } });
    expect(result?.bills).toHaveLength(1);
    expect(result?.bills[0]).toMatchObject({ billId: "large", date: "2025-01-04", amountCents: 80000, lowestIfMovedCents: 69100, lowestIfMovedDate: "2025-01-05" });
  });

  it("excludes paid, skipped and pre-reference occurrences", () => {
    const input = base({
      bills: [bill("paid", 1000, "ONE_TIME", "2025-01-03"), bill("skip", 1000, "ONE_TIME", "2025-01-03"), bill("past", 1000, "ONE_TIME", "2025-01-03"), bill("driver", 80000, "ONE_TIME", "2025-01-04")],
      occurrences: [occ("paid", "2025-01-03", "PAID"), occ("skip", "2025-01-03", "SKIPPED")],
    });
    const result = buildLowPointInsight(computeProjection(input), input, "2025-01-04");
    expect(result?.bills.map((row) => row.billId)).toEqual(["driver"]);
  });

  it("uses an occurrence amount override when moving the driver bill", () => {
    const input = base({
      bills: [bill("large", 80000, "ONE_TIME", "2025-01-04", { name: "Large bill" })],
      occurrences: [occ("large", "2025-01-04", "UPCOMING", 70000)],
    });
    const result = buildLowPointInsight(computeProjection(input), input, "2025-01-01");
    expect(result?.bills[0]).toMatchObject({
      amountCents: 70000,
      lowestIfMovedCents: 80100,
      lowestIfMovedDate: "2025-01-05",
    });
  });

  it("returns null when low point predates reference, no later paycheck, or no move improves it", () => {
    const input = base();
    expect(buildLowPointInsight(computeProjection(input), input, "2025-01-06")).toBeNull();
    const noPay = base({ incomes: [] });
    expect(buildLowPointInsight(computeProjection(noPay), noPay, "2025-01-01")).toBeNull();
    const noImprovement = base({ bills: [bill("after", 80000, "ONE_TIME", "2025-01-06")] });
    expect(buildLowPointInsight(computeProjection(noImprovement), noImprovement, "2025-01-01")).toBeNull();
  });

  it("orders by improved low, then ledger order, and limits to five", () => {
    const bills = Array.from({ length: 7 }, (_, i) => bill(`b${i}`, 10000 + i * 1000, "ONE_TIME", "2025-01-04", { name: `Bill ${i}` }));
    const input = base({ bills });
    const result = buildLowPointInsight(computeProjection(input), input, "2025-01-01");
    expect(result?.bills).toHaveLength(5);
    expect(result?.bills.map((row) => row.billId)).toEqual(["b6", "b5", "b4", "b3", "b2"]);
  });
});
