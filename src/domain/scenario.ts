/**
 * What-if scenarios: pure transformations of projection inputs.
 */
import type { ProjectionInput } from "./projection";
import type { BillDTO, IncomeDTO, ScenarioInput } from "../contracts/api";
import { computeProjection } from "./projection";

type Scenario = ScenarioInput;

const BILL_FREQUENCIES = new Set(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]);
const INCOME_FREQUENCIES = new Set(["WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_TIME"]);

function scenarioDate(s: Scenario): string | undefined {
  return s.date ?? s.dueDate ?? s.anchorDate ?? s.onDate;
}

function scenarioAmount(s: Scenario): number | undefined {
  return s.amountCents ?? s.amount;
}

function removeTargetId(s: Scenario): string | undefined {
  return s.id ?? s.sourceId ?? s.billId ?? s.incomeId ?? s.targetId ?? s.removeId;
}

function normalizeBillFrequency(value?: string): BillDTO["frequency"] {
  const v = (value ?? "ONE_TIME").toUpperCase();
  return (BILL_FREQUENCIES.has(v) ? v : "ONE_TIME") as BillDTO["frequency"];
}

function normalizeIncomeFrequency(value?: string): IncomeDTO["frequency"] {
  const v = (value ?? "ONE_TIME").toUpperCase();
  return (INCOME_FREQUENCIES.has(v) ? v : "ONE_TIME") as IncomeDTO["frequency"];
}

function scenarioId(s: Scenario, kind: "BILL" | "INCOME"): string {
  const date = scenarioDate(s) ?? "";
  const name = s.name ?? "";
  return `scenario:${kind.toLowerCase()}:${name}:${date}`;
}

function toBill(s: Scenario): ProjectionInput["bills"][number] {
  const date = scenarioDate(s);
  if (!date) throw new Error("Scenario ADD_BILL requires a date");
  const amount = scenarioAmount(s);
  if (amount === undefined) throw new Error("Scenario ADD_BILL requires an amount");
  return {
    id: scenarioId(s, "BILL"),
    name: s.name ?? "Scenario bill",
    amountCents: amount,
    frequency: normalizeBillFrequency(s.frequency),
    anchorDate: date,
    endDate: null,
    active: true,
    category: null,
  } as ProjectionInput["bills"][number];
}

function toIncome(s: Scenario): ProjectionInput["incomes"][number] {
  const date = scenarioDate(s);
  if (!date) throw new Error("Scenario ADD_INCOME requires a date");
  const amount = scenarioAmount(s);
  if (amount === undefined) throw new Error("Scenario ADD_INCOME requires an amount");
  return {
    id: scenarioId(s, "INCOME"),
    name: s.name ?? "Scenario income",
    amountCents: amount,
    frequency: normalizeIncomeFrequency(s.frequency),
    anchorDate: date,
    endDate: null,
    active: true,
    notes: null,
  } as ProjectionInput["incomes"][number];
}

export function applyScenarios(inputs: ProjectionInput, scenarios: Scenario | Scenario[]): ProjectionInput {
  const list = Array.isArray(scenarios) ? scenarios : [scenarios];
  let incomes = [...inputs.incomes];
  let bills = [...inputs.bills];
  let occurrences = [...(inputs.occurrences ?? [])];

  for (const s of list) {
    switch (s.kind) {
      case "ADD_BILL":
        bills = [...bills, toBill(s)];
        break;
      case "ADD_INCOME":
        incomes = [...incomes, toIncome(s)];
        break;
      case "REMOVE_BILL": {
        const id = removeTargetId(s);
        if (id) {
          bills = bills.filter((b) => b.id !== id);
          occurrences = occurrences.filter((o) => o.billId !== id);
        }
        break;
      }
      case "REMOVE_INCOME": {
        const id = removeTargetId(s);
        if (id) incomes = incomes.filter((i) => i.id !== id);
        break;
      }
      default:
        break;
    }
  }

  return { ...inputs, incomes, bills, occurrences };
}

export function applyScenario(inputs: ProjectionInput, scenario: Scenario | Scenario[]): ProjectionInput {
  return applyScenarios(inputs, scenario);
}

export function computeScenarioProjection(
  inputs: ProjectionInput,
  scenario: Scenario | Scenario[],
  from?: string,
  to?: string,
): ReturnType<typeof computeProjection> {
  const next = applyScenario(inputs, scenario);
  return computeProjection({
    ...next,
    from: from ?? next.from ?? inputs.from,
    to: to ?? next.to ?? inputs.to,
  });
}

export const apply = applyScenario;