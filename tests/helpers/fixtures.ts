import type { ProjectionInput } from "@/domain/projection";

type Settings = ProjectionInput["settings"];
type Income = ProjectionInput["incomes"][number];
type Bill = ProjectionInput["bills"][number];
type Occ = ProjectionInput["occurrences"][number];

export function settings(over: Partial<Settings> = {}): Settings {
  return {
    startingBalanceCents: 100000, // $1,000.00
    projectionStartDate: "2025-01-01", // a Wednesday
    forecastDays: 90, // 2025-01-01 .. 2025-03-31
    weekStartsOn: 0,
    currency: "USD",
    ...over,
  };
}

export function income(
  id: string,
  amountCents: number,
  frequency: Income["frequency"],
  anchorDate: string,
  over: Partial<Income> = {},
): Income {
  return { id, name: over.name ?? id, amountCents, frequency, anchorDate, endDate: null, active: true, ...over };
}

export function bill(
  id: string,
  amountCents: number,
  frequency: Bill["frequency"],
  anchorDate: string,
  over: Partial<Bill> = {},
): Bill {
  return {
    id,
    name: over.name ?? id,
    amountCents,
    frequency,
    anchorDate,
    endDate: null,
    active: true,
    category: null,
    ...over,
  };
}

export function occ(billId: string, dueDate: string, status: Occ["status"], amountOverrideCents: number | null = null): Occ {
  return { billId, dueDate, status, amountOverrideCents };
}

export function input(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return { settings: settings(), incomes: [], bills: [], occurrences: [], ...over };
}

/** Deterministic PRNG (mulberry32) so randomized tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    bool: (p = 0.5) => next() < p,
  };
}
