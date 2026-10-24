/** Constants and defaults with no Prisma import (safe for the seed script and tests). */
import { DEFAULT_FORECAST_DAYS, type SettingsDTO } from "../contracts/api";
import { todayLocal } from "../domain/dates";

/** Every row in the single-user MVP belongs to this household (CONVENTIONS section 9). */
export const HOUSEHOLD_ID = "local";

/** Defaults used when settings were never saved (docs/API.md): start = today. */
export function defaultSettings(today: string = todayLocal()): SettingsDTO {
  return {
    startingBalanceCents: 0,
    projectionStartDate: today,
    currency: "USD",
    forecastDays: DEFAULT_FORECAST_DAYS,
    weekStartsOn: 0,
    defaultCalendarView: "month",
    updatedAt: null,
  };
}
