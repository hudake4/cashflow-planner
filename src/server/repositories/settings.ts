import type { z } from "zod";
import type { SettingsDTO, settingsInputSchema } from "../../contracts/api";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { defaultSettings } from "../defaults";
import { toSettingsDTO } from "../mappers";

export type SettingsData = z.output<typeof settingsInputSchema>;

/** Sum of the accounts labelled BANK (no currency conversion, CONVENTIONS section 1). Credit, loan and other accounts are left out. */
async function accountsTotal(client: DbClient = db) {
  const total = await client.bankAccount.aggregate({
    where: { kind: "BANK", connection: { householdId: HOUSEHOLD_ID } },
    _sum: { balanceCents: true },
    _min: { balanceDate: true },
    _count: true,
  });
  return { balanceCents: total._sum.balanceCents, oldestBalanceDate: total._min.balanceDate, count: total._count };
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
  };
}

export async function saveSettings(data: SettingsData): Promise<SettingsDTO> {
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, ...data },
    update: data,
  });
  return toSettingsDTO(row, await accountsTotal());
}
