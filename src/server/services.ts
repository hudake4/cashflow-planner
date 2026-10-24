/**
 * Service layer: loads persisted data and runs the pure engine. All balances come
 * from `src/domain`; nothing computed by a client is ever trusted.
 */
import type { DashboardResponse, ProjectionResponse } from "../contracts/api";
import { buildDashboard } from "../domain/dashboard";
import { todayLocal } from "../domain/dates";
import { computeProjection } from "../domain/projection";
import { effectiveStartingBalanceCents } from "../domain/starting-balance";
import { listAllOccurrences, listBills } from "./repositories/bills";
import { listIncome } from "./repositories/income";
import { getSettings } from "./repositories/settings";

async function loadInputs() {
  const [settings, incomes, bills, occurrences] = await Promise.all([
    getSettings(),
    listIncome(),
    listBills(),
    listAllOccurrences(),
  ]);
  // The engine and every view see one balance: the typed one, or the bank accounts' total.
  return {
    settings: { ...settings, startingBalanceCents: effectiveStartingBalanceCents(settings) },
    incomes,
    bills,
    occurrences,
  };
}

export async function getProjection(from?: string, to?: string): Promise<ProjectionResponse> {
  return computeProjection({ ...(await loadInputs()), from, to });
}

export async function getDashboard(today: string = todayLocal()): Promise<DashboardResponse> {
  return buildDashboard({ ...(await loadInputs()), today });
}
