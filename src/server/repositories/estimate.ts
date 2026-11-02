/**
 * Suggested amount for a bill from the stored bank snapshot. Reads the local database only: it
 * never calls SimpleFIN, and it never writes (the user decides whether to use the suggestion).
 */
import type { BillEstimateDTO } from "../../contracts/api";
import { todayLocal } from "../../domain/dates";
import { estimateBillAmount } from "../../domain/estimate";
import { db, HOUSEHOLD_ID } from "../db";
import { historyCutoff } from "../simplefin-mapping";
import { getBill } from "./bills";
import { getSettings } from "./settings";

export async function estimateBill(billId: string, dueDate?: string, now: Date = new Date()): Promise<BillEstimateDTO> {
  const bill = await getBill(billId);
  const today = todayLocal(now);
  const historyStart = historyCutoff(today);
  const [rows, settings] = await Promise.all([
    db.bankTransaction.findMany({
      where: { pending: false, date: { gte: historyStart }, account: { connection: { householdId: HOUSEHOLD_ID } } },
      select: { date: true, description: true, amountCents: true },
    }),
    getSettings(),
  ]);

  if (rows.length === 0) return { estimate: null, reason: "NO_BANK_DATA", currency: settings.currency };
  const result = estimateBillAmount({
    billName: bill.name,
    frequency: bill.frequency,
    anchorDate: bill.anchorDate,
    dueDate: dueDate ?? today,
    transactions: rows,
    today,
    historyStart,
  });
  return { ...result, currency: settings.currency };
}
