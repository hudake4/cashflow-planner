/**
 * Missing-paycheck detection (CONVENTIONS section 16). Fixture dates: 2026-10-16 and
 * 2026-10-23 are Fridays, 2026-10-28 is a Wednesday. A biweekly pay anchored on the
 * 16th lands on 10-16 then 10-30; a weekly pay anchored on the 2nd lands on Fridays.
 */
import { describe, expect, it } from "vitest";
import {
  findMissingPaychecks,
  MISSED_PAYCHECK_GRACE_DAYS,
  MISSED_PAYCHECK_LOOKBACK_DAYS,
  MISSED_PAYCHECK_MATCH_DAYS,
  type MissingPaycheckInput,
} from "@/domain/missing-paycheck";

type Income = MissingPaycheckInput["incomes"][number];
type Tx = MissingPaycheckInput["transactions"][number];

const income = (id: string, over: Partial<Income> = {}): Income => ({
  id,
  name: id,
  amountCents: 215000,
  frequency: "BIWEEKLY",
  anchorDate: "2026-10-16",
  endDate: null,
  active: true,
  ...over,
});

const dep = (date: string, description: string, amountCents: number): Tx => ({ date, description, amountCents });

// Bank history that proves the bank is syncing but contains no matching paycheck deposit.
const unrelated = [dep("2026-10-20", "GROCERY STORE", -5000)];

const run = (incomes: Income[], transactions: Tx[], today = "2026-10-28") =>
  findMissingPaychecks({ incomes, transactions, currency: "USD" }, today);

describe("findMissingPaychecks: cadence and grace", () => {
  it("reports a missed biweekly payday once it is past the grace period", () => {
    const [a] = run([income("pay", { name: "Acme Corp" })], unrelated);
    expect(a).toEqual({
      key: "missed-paycheck:pay:2026-10-16",
      kind: "MISSED_PAYCHECK",
      title: "Acme Corp may be missing",
      body: "No $2,150.00 deposit was seen for the expected payday on Friday, Oct 16.",
      expiresOn: "2026-10-30",
    });
  });

  it("gives each missed weekly occurrence its own key", () => {
    const weekly = income("pay", { name: "Acme", frequency: "WEEKLY", anchorDate: "2026-10-02" });
    expect(run([weekly], unrelated).map((a) => a.key)).toEqual([
      "missed-paycheck:pay:2026-10-16",
      "missed-paycheck:pay:2026-10-23",
    ]);
  });

  it("does not alert on the due day or within the grace period, then does on day 3", () => {
    expect(MISSED_PAYCHECK_GRACE_DAYS).toBe(3);
    expect(run([income("pay")], unrelated, "2026-10-16")).toEqual([]); // due today
    expect(run([income("pay")], unrelated, "2026-10-18")).toEqual([]); // 2 days late
    expect(run([income("pay")], unrelated, "2026-10-19")).toHaveLength(1); // 3 days late
  });

  it("stops watching paydays older than the lookback window", () => {
    expect(MISSED_PAYCHECK_LOOKBACK_DAYS).toBe(14);
    // 10-16 is 15 days old, so it is no longer watched.
    expect(run([income("pay")], unrelated, "2026-10-31")).toEqual([]);
  });
});

describe("findMissingPaychecks: deposit matching", () => {
  it("is quiet when a matching deposit arrived on time", () => {
    const deposits = [dep("2026-10-16", "ACME CORP DIRECT DEP PAYROLL", 215000)];
    expect(run([income("pay", { name: "Acme Corp" })], deposits)).toEqual([]);
  });

  it("accepts a deposit a couple of days early or late", () => {
    expect(MISSED_PAYCHECK_MATCH_DAYS).toBe(3);
    const early = [dep("2026-10-14", "ACME CORP", 215000)];
    const late = [dep("2026-10-19", "ACME CORP", 215000)];
    expect(run([income("pay", { name: "Acme Corp" })], early, "2026-10-19")).toEqual([]);
    expect(run([income("pay", { name: "Acme Corp" })], late, "2026-10-19")).toEqual([]);
  });

  it("still reports when the deposit amount is too different", () => {
    const deposits = [dep("2026-10-16", "ACME CORP DIRECT DEP PAYROLL", 100000)];
    expect(run([income("pay", { name: "Acme Corp" })], deposits)).toHaveLength(1);
  });

  it("still reports when no deposit shares the name", () => {
    const deposits = [dep("2026-10-16", "INTEREST PAYMENT", 215000)];
    expect(run([income("pay", { name: "Acme Corp" })], deposits)).toHaveLength(1);
  });

  it("still reports when the matching deposit is dated outside the match window", () => {
    const deposits = [dep("2026-10-20", "ACME CORP", 215000)];
    expect(run([income("pay", { name: "Acme Corp" })], deposits)).toHaveLength(1);
  });

  it("matches by the leading word only when the amount is close", () => {
    // "Contoso" is 7 letters, so `sharesLeadWord` applies; the rest of the names differ.
    const close = [dep("2026-10-16", "CONTOSO INC", 213000)];
    expect(run([income("pay", { name: "Contoso Payroll" })], close)).toEqual([]);
    const far = [dep("2026-10-16", "CONTOSO INC", 180000)];
    expect(run([income("pay", { name: "Contoso Payroll" })], far)).toHaveLength(1);
  });
});

describe("findMissingPaychecks: exclusions", () => {
  it("ignores one-time, monthly and inactive income", () => {
    expect(run([income("one", { frequency: "ONE_TIME" })], unrelated)).toEqual([]);
    expect(run([income("mon", { frequency: "MONTHLY" })], unrelated)).toEqual([]);
    expect(run([income("off", { active: false })], unrelated)).toEqual([]);
  });

  it("stops at the income's end date", () => {
    const ended = income("pay", { name: "Acme", frequency: "WEEKLY", anchorDate: "2026-10-02", endDate: "2026-10-16" });
    expect(run([ended], unrelated).map((a) => a.key)).toEqual(["missed-paycheck:pay:2026-10-16"]);
  });

  it("is quiet when there is no bank history to compare against", () => {
    expect(run([income("pay", { name: "Acme Corp" })], [])).toEqual([]);
  });
});
