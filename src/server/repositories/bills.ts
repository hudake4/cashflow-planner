import type { z } from "zod";
import type { BillDTO, BillOccurrenceDTO, billInputSchema, occurrenceUpdateSchema } from "../../contracts/api";
import { isScheduledOn } from "../../domain/recurrence";
import { db, HOUSEHOLD_ID, type DbClient } from "../db";
import { badRequest, notFound } from "../http";
import { toBillDTO, toOccurrenceDTO } from "../mappers";
import { byName } from "./income";

export type BillData = z.output<typeof billInputSchema>;
export type OccurrenceData = z.output<typeof occurrenceUpdateSchema>;

export async function listBills(client: DbClient = db): Promise<BillDTO[]> {
  const rows = await client.bill.findMany({ where: { householdId: HOUSEHOLD_ID } });
  return rows.map(toBillDTO).sort(byName);
}

/** Returns the bill, or throws 404. */
export async function getBill(id: string): Promise<BillDTO> {
  const row = await db.bill.findFirst({ where: { id, householdId: HOUSEHOLD_ID } });
  if (!row) throw notFound("Bill");
  return toBillDTO(row);
}

export async function createBill(data: BillData): Promise<BillDTO> {
  return toBillDTO(await db.bill.create({ data: { ...data, householdId: HOUSEHOLD_ID } }));
}

/** Full replacement. Never touches occurrence rows (CONVENTIONS section 5). */
export async function updateBill(id: string, data: BillData): Promise<BillDTO> {
  await getBill(id);
  return toBillDTO(await db.bill.update({ where: { id }, data }));
}

/** Deletes the bill; occurrence rows cascade. */
export async function deleteBill(id: string): Promise<void> {
  await getBill(id);
  await db.bill.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

export async function listOccurrences(billId: string): Promise<BillOccurrenceDTO[]> {
  await getBill(billId);
  const rows = await db.billOccurrence.findMany({ where: { billId }, orderBy: { dueDate: "asc" } });
  return rows.map(toOccurrenceDTO);
}

/** All recorded occurrences for the household (projection input). */
export async function listAllOccurrences(client: DbClient = db): Promise<BillOccurrenceDTO[]> {
  const rows = await client.billOccurrence.findMany({ where: { bill: { householdId: HOUSEHOLD_ID } } });
  return rows.map(toOccurrenceDTO);
}

/** Records a status for one scheduled occurrence; 400 if `dueDate` isn't scheduled (section 5). */
export async function upsertOccurrence(billId: string, dueDate: string, data: OccurrenceData): Promise<BillOccurrenceDTO> {
  const bill = await getBill(billId);
  if (!isScheduledOn(bill, dueDate)) {
    throw badRequest(`${dueDate} is not a scheduled due date for this bill.`);
  }
  const row = await db.billOccurrence.upsert({
    where: { billId_dueDate: { billId, dueDate } },
    create: { billId, dueDate, ...data },
    update: data,
  });
  return toOccurrenceDTO(row);
}

/** Removes a recorded status (back to UPCOMING at the default amount). Idempotent. */
export async function deleteOccurrence(billId: string, dueDate: string): Promise<void> {
  await getBill(billId);
  await db.billOccurrence.deleteMany({ where: { billId, dueDate } });
}
