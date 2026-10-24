import type { z } from "zod";
import type { IncomeDTO, incomeInputSchema } from "../../contracts/api";
import { db, HOUSEHOLD_ID } from "../db";
import { notFound } from "../http";
import { toIncomeDTO } from "../mappers";

export type IncomeData = z.output<typeof incomeInputSchema>;

export async function listIncome(): Promise<IncomeDTO[]> {
  const rows = await db.incomeSource.findMany({ where: { householdId: HOUSEHOLD_ID } });
  return rows.map(toIncomeDTO).sort(byName);
}

/** Returns the income source, or throws 404. */
export async function getIncome(id: string): Promise<IncomeDTO> {
  const row = await db.incomeSource.findFirst({ where: { id, householdId: HOUSEHOLD_ID } });
  if (!row) throw notFound("Income source");
  return toIncomeDTO(row);
}

export async function createIncome(data: IncomeData): Promise<IncomeDTO> {
  return toIncomeDTO(await db.incomeSource.create({ data: { ...data, householdId: HOUSEHOLD_ID } }));
}

/** Full replacement of the editable fields. */
export async function updateIncome(id: string, data: IncomeData): Promise<IncomeDTO> {
  await getIncome(id);
  return toIncomeDTO(await db.incomeSource.update({ where: { id }, data }));
}

export async function deleteIncome(id: string): Promise<void> {
  await getIncome(id);
  await db.incomeSource.delete({ where: { id } });
}

/** Case-insensitive name order, then exact, then id (deterministic). */
export function byName(a: { name: string; id: string }, b: { name: string; id: string }): number {
  const al = a.name.toLowerCase();
  const bl = b.name.toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
