/**
 * Bank transactions that look like payments of unpaid bill occurrences. Reads the local database
 * only: it never calls SimpleFIN (that would spend the 24 requests/day allowance on a page view).
 */
import type { BillMatchesResponse } from "../../contracts/api";
import { matchBillPayments } from "../../domain/bill-match";
import { todayLocal } from "../../domain/dates";
import { db, HOUSEHOLD_ID } from "../db";
import { historyCutoff } from "../simplefin-mapping";
import { listAllOccurrences, listBills } from "./bills";
import { getSettings } from "./settings";

export async function findBillMatches(now: Date = new Date()): Promise<BillMatchesResponse> {
  const today = todayLocal(now);
  const [rows, bills, occurrences, settings] = await Promise.all([
    db.bankTransaction.findMany({
      where: { pending: false, date: { gte: historyCutoff(today) }, account: { connection: { householdId: HOUSEHOLD_ID } } },
      select: { id: true, date: true, description: true, amountCents: true },
    }),
    listBills(),
    listAllOccurrences(),
    getSettings(),
  ]);

  return { matches: matchBillPayments({ transactions: rows, bills, occurrences, today }), currency: settings.currency };
}
