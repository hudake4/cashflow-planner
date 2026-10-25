/**
 * Prisma row → DTO mappers. Enum-like columns are plain strings in SQLite; they
 * are only ever written after Zod validation, so the casts here are safe.
 */
import type { Bill, BillOccurrence, IncomeSource, Settings } from "@prisma/client";
import type {
  BillDTO,
  BillFrequency,
  BillOccurrenceDTO,
  CalendarView,
  IncomeDTO,
  IncomeFrequency,
  OccurrenceStatus,
  SettingsDTO,
  StartingBalanceSource,
} from "../contracts/api";

export function toSettingsDTO(row: Settings, accounts: { balanceCents: number | null; count: number }): SettingsDTO {
  return {
    startingBalanceCents: row.startingBalanceCents,
    startingBalanceSource: row.startingBalanceSource as StartingBalanceSource,
    accountsBalanceCents: accounts.count ? accounts.balanceCents : null,
    accountCount: accounts.count,
    projectionStartDate: row.projectionStartDate,
    currency: row.currency,
    forecastDays: row.forecastDays,
    weekStartsOn: row.weekStartsOn,
    defaultCalendarView: row.defaultCalendarView as CalendarView,
    desktopNotifications: row.desktopNotifications,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toIncomeDTO(row: IncomeSource): IncomeDTO {
  return {
    id: row.id,
    name: row.name,
    amountCents: row.amountCents,
    frequency: row.frequency as IncomeFrequency,
    anchorDate: row.anchorDate,
    endDate: row.endDate,
    active: row.active,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBillDTO(row: Bill): BillDTO {
  return {
    id: row.id,
    name: row.name,
    amountCents: row.amountCents,
    frequency: row.frequency as BillFrequency,
    anchorDate: row.anchorDate,
    endDate: row.endDate,
    category: row.category,
    notes: row.notes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOccurrenceDTO(row: BillOccurrence): BillOccurrenceDTO {
  return {
    billId: row.billId,
    dueDate: row.dueDate,
    status: row.status as OccurrenceStatus,
    amountOverrideCents: row.amountOverrideCents,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}
