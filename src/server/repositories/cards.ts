import { estimateCardBill, nextDayOfMonth } from "../../domain/card-bill";
import { detectRecurring } from "../../domain/recurring";
import { todayLocal } from "../../domain/dates";
import { historyCutoff } from "../simplefin-mapping";
import { db, HOUSEHOLD_ID } from "../db";
import { badRequest, notFound } from "../http";
import { listBills, createBill, updateBill } from "./bills";

export interface CardBillEstimateResult {
  accountId: string;
  closingDate: string;
  dueDate: string;
  projectedBillCents: number;
  minimumPaymentCents: number | null;
  billId: string;
}

export async function estimateAndUpsertCardBill(accountId: string, variableSpendCents = 0, now: Date = new Date()): Promise<CardBillEstimateResult> {
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, connection: { householdId: HOUSEHOLD_ID } },
  });
  if (!account) throw notFound("Account");
  if (account.kind !== "CREDIT") throw badRequest("Account is not a credit card");
  const today = todayLocal(now);
  // Accounts saved before dates existed only have the day of month: its next occurrence is an equivalent anchor.
  const closingAnchor = account.statementClosingDate ?? (account.statementClosingDay == null ? null : nextDayOfMonth(today, account.statementClosingDay));
  const dueAnchor = account.paymentDueDate ?? (account.paymentDueDay == null ? null : nextDayOfMonth(today, account.paymentDueDay));
  if (!closingAnchor || !dueAnchor) {
    throw badRequest("Set the statement closing date and payment due date first");
  }

  const rows = await db.bankTransaction.findMany({
    where: { accountId, pending: false, date: { gte: historyCutoff(today) } },
    select: { date: true, description: true, amountCents: true },
  });

  const suggestions = detectRecurring({
    transactions: rows.map((r) => ({ ...r, accountId })),
    incomes: [],
    bills: [],
    today,
    accountId,
  });

  const charges = suggestions
    .filter((s) => s.kind === "BILL")
    .map((s) => ({ amountCents: s.amountCents, date: s.nextDate }));

  const estimate = estimateCardBill({
    balanceCents: account.balanceCents,
    statementClosingAnchor: closingAnchor,
    paymentDueAnchor: dueAnchor,
    today,
    charges,
    variableSpendCents,
    aprBasisPoints: account.aprBasisPoints,
    minimumPaymentRule: account.minimumPaymentRule,
  });

  const marker = `card-payment-estimate:${accountId}`;
  const bills = await listBills();
  const existing = bills.find((b) => b.notes === marker);

  const billData = {
    name: "Credit card payment",
    amountCents: estimate.projectedBillCents,
    frequency: "ONE_TIME" as const,
    anchorDate: estimate.dueDate,
    endDate: null,
    category: "Credit card",
    notes: marker,
    active: true,
  };

  let billId: string;
  if (existing) {
    const updated = await updateBill(existing.id, billData);
    billId = updated.id;
  } else {
    const created = await createBill(billData);
    billId = created.id;
  }

  return {
    accountId,
    closingDate: estimate.closingDate,
    dueDate: estimate.dueDate,
    projectedBillCents: estimate.projectedBillCents,
    minimumPaymentCents: estimate.minimumPaymentCents,
    billId,
  };
}