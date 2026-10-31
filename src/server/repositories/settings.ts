import type { z } from "zod";
import type { SettingsDTO, settingsInputSchema, settingsPatchSchema } from "../../contracts/api";
import { addDays, minDate, todayLocal } from "../../domain/dates";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { defaultSettings } from "../defaults";
import { toSettingsDTO, type AccountsSummary } from "../mappers";

export type SettingsData = z.output<typeof settingsInputSchema>;

/** A bank account whose balance is older than this many days stops setting the projection start date (CONVENTIONS section 3). */
export const STALE_BALANCE_DAYS = 7;

/**
 * Sum of the accounts labelled BANK (no currency conversion, CONVENTIONS section 1). Credit, loan and other accounts are left out.
 * Every BANK account is summed, but the date comes only from the ones refreshed within `STALE_BALANCE_DAYS` of
 * today (all of them when none is that fresh), and never lies after today (CONVENTIONS section 3).
 */
async function accountsTotal(client: DbClient = db, today: string = todayLocal()): Promise<AccountsSummary> {
  const where = { kind: "BANK", connection: { householdId: HOUSEHOLD_ID } };
  const [total, fresh] = await Promise.all([
    client.bankAccount.aggregate({ where, _sum: { balanceCents: true }, _min: { balanceDate: true }, _count: true }),
    client.bankAccount.aggregate({
      where: { ...where, balanceDate: { gte: addDays(today, -STALE_BALANCE_DAYS) } },
      _min: { balanceDate: true },
      _count: true,
    }),
  ]);
  const oldest = fresh._count ? fresh._min.balanceDate : total._min.balanceDate;
  return {
    balanceCents: total._sum.balanceCents,
    oldestBalanceDate: oldest === null ? null : minDate(oldest, today),
    count: total._count,
    staleCount: fresh._count ? total._count - fresh._count : 0,
  };
}

export async function getSettings(client: DbClient = db): Promise<SettingsDTO> {
  const [row, accounts] = await Promise.all([
    client.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } }),
    accountsTotal(client),
  ]);
  if (row) return toSettingsDTO(row, accounts);
  return {
    ...defaultSettings(),
    accountsBalanceCents: accounts.count ? accounts.balanceCents : null,
    accountCount: accounts.count,
    accountsBalanceDate: accounts.count ? accounts.oldestBalanceDate : null,
    accountsStaleCount: accounts.staleCount,
  };
}

/** Changes only the given settings. Creates the row from the defaults when settings were never saved. */
export async function patchSettings(data: z.output<typeof settingsPatchSchema>): Promise<SettingsDTO> {
  const defaults = defaultSettings();
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, projectionStartDate: defaults.projectionStartDate, ...data },
    update: data,
  });
  return toSettingsDTO(row, await accountsTotal());
}

export async function saveSettings(data: SettingsData): Promise<SettingsDTO> {
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, ...data },
    update: data,
  });
  return toSettingsDTO(row, await accountsTotal());
}
