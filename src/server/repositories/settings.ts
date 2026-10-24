import type { z } from "zod";
import type { SettingsDTO, settingsInputSchema } from "../../contracts/api";
import { db, HOUSEHOLD_ID } from "../db";
import { defaultSettings } from "../defaults";
import { toSettingsDTO } from "../mappers";

export type SettingsData = z.output<typeof settingsInputSchema>;

/** Sum of every connected bank account's balance (no currency conversion, CONVENTIONS section 1). */
async function accountsTotal() {
  const total = await db.bankAccount.aggregate({
    where: { connection: { householdId: HOUSEHOLD_ID } },
    _sum: { balanceCents: true },
    _count: true,
  });
  return { balanceCents: total._sum.balanceCents, count: total._count };
}

export async function getSettings(): Promise<SettingsDTO> {
  const [row, accounts] = await Promise.all([
    db.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } }),
    accountsTotal(),
  ]);
  if (row) return toSettingsDTO(row, accounts);
  return { ...defaultSettings(), accountsBalanceCents: accounts.count ? accounts.balanceCents : null, accountCount: accounts.count };
}

export async function saveSettings(data: SettingsData): Promise<SettingsDTO> {
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, ...data },
    update: data,
  });
  return toSettingsDTO(row, await accountsTotal());
}
