import type { z } from "zod";
import type { SavingsGoalDTO, savingsGoalInputSchema } from "../../contracts/api";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { notFound } from "../http";
import { toSavingsGoalDTO } from "../mappers";

export type SavingsGoalData = z.output<typeof savingsGoalInputSchema>;

export async function listSavingsGoals(client: DbClient = db): Promise<SavingsGoalDTO[]> {
  const rows = await client.savingsGoal.findMany({ where: { householdId: HOUSEHOLD_ID } });
  return rows.map(toSavingsGoalDTO).sort(byNameThenDate);
}

export async function getSavingsGoal(id: string): Promise<SavingsGoalDTO> {
  const row = await db.savingsGoal.findFirst({ where: { id, householdId: HOUSEHOLD_ID } });
  if (!row) throw notFound("Savings goal");
  return toSavingsGoalDTO(row);
}

export async function createSavingsGoal(data: SavingsGoalData): Promise<SavingsGoalDTO> {
  return toSavingsGoalDTO(
    await db.savingsGoal.create({ data: { ...data, householdId: HOUSEHOLD_ID } }),
  );
}

export async function updateSavingsGoal(id: string, data: SavingsGoalData): Promise<SavingsGoalDTO> {
  await getSavingsGoal(id);
  return toSavingsGoalDTO(await db.savingsGoal.update({ where: { id }, data }));
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  await getSavingsGoal(id);
  await db.savingsGoal.delete({ where: { id } });
}

function byNameThenDate(a: { name: string | null; targetDate?: string; id: string }, b: typeof a): number {
  const an = (a.name ?? "").toLowerCase();
  const bn = (b.name ?? "").toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  if (a.name !== b.name) return (a.name ?? "") < (b.name ?? "") ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
