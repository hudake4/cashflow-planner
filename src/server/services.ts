/**
 * Service layer: loads persisted data and runs the pure engine. All balances come
 * from `src/domain`; nothing computed by a client is ever trusted.
 */
import {
  type AlertsResponse,
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_FORMAT_VERSION,
  dataExportSchema,
  type DashboardResponse,
  type DataExportDTO,
  type ProjectionResponse,
  type ScenarioInput,
} from "../contracts/api";
import { buildAlerts } from "../domain/alerts";
import { buildDashboard } from "../domain/dashboard";
import { todayLocal } from "../domain/dates";
import { findMissingPaychecks } from "../domain/missing-paycheck";
import { computeProjection, type ProjectionInput } from "../domain/projection";
import { applyScenario } from "../domain/scenario";
import { effectiveProjectionStartDate, effectiveStartingBalanceCents } from "../domain/starting-balance";
import { db } from "./db";
import { listAllOccurrences, listBills } from "./repositories/bills";
import { listIncome } from "./repositories/income";
import { listAllTransactionsByConnection, listBankAccountTransactions, listConnections } from "./repositories/institutions";
import { listSavingsGoals } from "./repositories/savings-goals";
import { getSettings } from "./repositories/settings";

async function loadInputs() {
  const [settings, incomes, bills, occurrences] = await Promise.all([
    getSettings(),
    listIncome(),
    listBills(),
    listAllOccurrences(),
  ]);
  // The engine and every view see one balance and one start date: the typed ones, or the bank
  // accounts' total and their oldest balance date. Only this copy is changed, never the stored row.
  return {
    settings: {
      ...settings,
      startingBalanceCents: effectiveStartingBalanceCents(settings),
      projectionStartDate: effectiveProjectionStartDate(settings),
    },
    incomes,
    bills,
    occurrences,
  };
}

export async function getProjection(from?: string, to?: string): Promise<ProjectionResponse> {
  return computeProjection({ ...(await loadInputs()), from, to });
}

export async function getDashboard(today: string = todayLocal()): Promise<DashboardResponse> {
  const [inputs, goals] = await Promise.all([loadInputs(), listSavingsGoals()]);
  return buildDashboard({ ...inputs, goals, today });
}

export async function getScenarioProjection(
  scenario: ScenarioInput | ScenarioInput[],
  from?: string,
  to?: string,
): Promise<ProjectionResponse> {
  const base = await loadInputs();
  const input = applyScenario({ ...base, from, to }, scenario);
  return computeProjection({ ...input, from: from ?? input.from, to: to ?? input.to });
}

export async function getScenarioDashboard(
  scenario: ScenarioInput | ScenarioInput[],
  today: string = todayLocal(),
): Promise<DashboardResponse> {
  const [base, goals] = await Promise.all([loadInputs(), listSavingsGoals()]);
  const input = applyScenario({ ...base } as ProjectionInput, scenario);
  return buildDashboard({
    settings: base.settings,
    goals,
    incomes: input.incomes,
    bills: input.bills,
    occurrences: input.occurrences,
    today,
  });
}

export async function getAlerts(today: string = todayLocal()): Promise<AlertsResponse> {
  const settings = await getSettings();
  if (!settings.desktopNotifications) return { today, enabled: false, alerts: [] };
  const [projection, incomes, bankTransactions] = await Promise.all([
    getProjection(),
    listIncome(),
    listBankAccountTransactions(),
  ]);
  return {
    today,
    enabled: true,
    alerts: [...buildAlerts(projection, today), ...findMissingPaychecks({ incomes, transactions: bankTransactions, currency: settings.currency }, today)],
  };
}

/**
 * Everything stored for the household, for the backup download. Bank connections are
 * built from InstitutionDTO, which never carries the access URL (CONVENTIONS section 9).
 * Settings are exported as stored: the typed balance and start date, not the accounts' total and date.
 */
export async function getDataExport(appVersion: string, now: Date = new Date()): Promise<DataExportDTO> {
  // One read transaction, so the file is a single consistent snapshot even if a sync or edit lands mid-export.
  const { settings, incomes, bills, occurrences, connections, transactions } = await db.$transaction(
    async (tx) => ({
      settings: await getSettings(tx),
      incomes: await listIncome(tx),
      bills: await listBills(tx),
      occurrences: await listAllOccurrences(tx),
      connections: await listConnections(tx),
      transactions: await listAllTransactionsByConnection(tx),
    }),
    { timeout: 30_000 },
  );
  const data: DataExportDTO = {
    format: DATA_EXPORT_FORMAT,
    formatVersion: DATA_EXPORT_FORMAT_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    settings,
    incomes,
    bills,
    billOccurrences: [...occurrences].sort(
      (a, b) => (a.billId < b.billId ? -1 : a.billId > b.billId ? 1 : a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0),
    ),
    institutions: connections.map((c) => ({
      id: c.id,
      name: c.name,
      connectedAt: c.connectedAt,
      lastSyncedAt: c.lastSyncedAt,
      accounts: c.accounts,
      transactions: transactions.get(c.id) ?? [],
    })),
  };
  // The schema is strict about institutions, accounts and transactions: a stray field (such as a
  // credential) fails the export instead of reaching the file. Report paths only, never values.
  const checked = dataExportSchema.safeParse(data);
  if (!checked.success) {
    const paths = checked.error.issues.map((i) => i.path.join(".") || "_root").join(", ");
    throw new Error(`Data export failed its schema check at: ${paths}`);
  }
  return checked.data;
}
