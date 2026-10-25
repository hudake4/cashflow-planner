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
} from "../contracts/api";
import { buildAlerts } from "../domain/alerts";
import { buildDashboard } from "../domain/dashboard";
import { todayLocal } from "../domain/dates";
import { computeProjection } from "../domain/projection";
import { effectiveStartingBalanceCents } from "../domain/starting-balance";
import { db } from "./db";
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

export async function getAlerts(today: string = todayLocal()): Promise<AlertsResponse> {
  const { desktopNotifications } = await getSettings();
  if (!desktopNotifications) return { today, enabled: false, alerts: [] };
  return { today, enabled: true, alerts: buildAlerts(await getProjection(), today) };
}

/**
 * Everything stored for the household, for the backup download. Bank connections are
 * built from InstitutionDTO, which never carries the access URL (CONVENTIONS section 9).
 * Settings are exported as stored: the typed balance, not the accounts' total.
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
