/**
 * Service layer: loads persisted data and runs the pure engine. All balances come
 * from `src/domain`; nothing computed by a client is ever trusted.
 */
import {
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_FORMAT_VERSION,
  type DashboardResponse,
  type DataExportDTO,
  type ProjectionResponse,
} from "../contracts/api";
import { buildDashboard } from "../domain/dashboard";
import { todayLocal } from "../domain/dates";
import { computeProjection } from "../domain/projection";
import { effectiveStartingBalanceCents } from "../domain/starting-balance";
import { listAllOccurrences, listBills } from "./repositories/bills";
import { listIncome } from "./repositories/income";
import { listAllTransactionsByConnection, listConnections } from "./repositories/institutions";
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

/**
 * Everything stored for the household, for the backup download. Bank connections are
 * built from InstitutionDTO, which never carries the access URL (CONVENTIONS section 9).
 * Settings are exported as stored: the typed balance, not the accounts' total.
 */
export async function getDataExport(appVersion: string, now: Date = new Date()): Promise<DataExportDTO> {
  const [settings, incomes, bills, occurrences, connections, transactions] = await Promise.all([
    getSettings(),
    listIncome(),
    listBills(),
    listAllOccurrences(),
    listConnections(),
    listAllTransactionsByConnection(),
  ]);
  return {
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
}
