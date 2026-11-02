/** How a schedule's frequency is worded for people: in the app, and in the register CSV. */
import type { BillFrequency, IncomeFrequency } from "../contracts/api";

export const FREQUENCY_LABELS: Record<IncomeFrequency | BillFrequency, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};
