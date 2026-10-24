import type { z } from "zod";
import type { SettingsDTO, settingsInputSchema } from "../../contracts/api";
import { db, HOUSEHOLD_ID } from "../db";
import { defaultSettings } from "../defaults";
import { toSettingsDTO } from "../mappers";

export type SettingsData = z.output<typeof settingsInputSchema>;

export async function getSettings(): Promise<SettingsDTO> {
  const row = await db.settings.findUnique({ where: { householdId: HOUSEHOLD_ID } });
  return row ? toSettingsDTO(row) : defaultSettings();
}

export async function saveSettings(data: SettingsData): Promise<SettingsDTO> {
  const row = await db.settings.upsert({
    where: { householdId: HOUSEHOLD_ID },
    create: { householdId: HOUSEHOLD_ID, ...data },
    update: data,
  });
  return toSettingsDTO(row);
}
