/**
 * Desktop alerts (CONVENTIONS section 14). Fixture: start 2025-01-01 (Wed), 90 days.
 * 2025-01-06 is a Monday, 2025-01-10 a Friday.
 */
import { describe, expect, it } from "vitest";
import { BILL_LEAD_DAYS, buildAlerts, LOW_BALANCE_LOOKAHEAD_DAYS } from "@/domain/alerts";
import { computeProjection } from "@/domain/projection";
import { bill, income, occ, settings } from "../helpers/fixtures";

type Parts = Parameters<typeof computeProjection>[0];
const alertsFor = (today: string, parts: Partial<Parts>) =>
  buildAlerts(computeProjection({ settings: settings(), incomes: [], bills: [], occurrences: [], ...parts }), today);

describe("buildAlerts: bills due soon", () => {
  const rent = bill("rent", 40000, "MONTHLY", "2025-01-10", { name: "Rent" });

  it("reports a bill within the lead time, with days until it is due", () => {
    const [a] = alertsFor("2025-01-07", { bills: [rent] });
    expect(a).toEqual({
      key: "bill:rent:2025-01-10",
      kind: "BILL_DUE",
      title: "Rent due in 3 days",
      body: "$400.00 on Friday, Jan 10.",
      expiresOn: "2025-01-10",
    });
  });

  it("says today and tomorrow instead of a day count", () => {
    expect(alertsFor("2025-01-10", { bills: [rent] })[0].title).toBe("Rent due today");
    expect(alertsFor("2025-01-09", { bills: [rent] })[0].title).toBe("Rent due tomorrow");
  });

  it("ignores a bill outside the lead time, in the past, paid or skipped", () => {
    expect(BILL_LEAD_DAYS).toBe(3);
    expect(alertsFor("2025-01-06", { bills: [rent] })).toEqual([]); // 4 days away
    expect(alertsFor("2025-01-11", { bills: [rent] })).toEqual([]); // yesterday
    expect(alertsFor("2025-01-08", { bills: [rent], occurrences: [occ("rent", "2025-01-10", "PAID")] })).toEqual([]);
    expect(alertsFor("2025-01-08", { bills: [rent], occurrences: [occ("rent", "2025-01-10", "SKIPPED")] })).toEqual([]);
  });

  it("uses a per-occurrence amount override and skips inactive bills", () => {
    const [a] = alertsFor("2025-01-08", { bills: [rent], occurrences: [occ("rent", "2025-01-10", "UPCOMING", 99900)] });
    expect(a.body).toBe("$999.00 on Friday, Jan 10.");
    expect(alertsFor("2025-01-08", { bills: [{ ...rent, active: false }] })).toEqual([]);
  });

  it("gives each occurrence of a repeating bill its own key", () => {
    const weekly = bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" });
    const keys = alertsFor("2025-01-06", { bills: [weekly] }).map((a) => a.key);
    expect(keys).toEqual(["bill:gym:2025-01-08"]);
    expect(alertsFor("2025-01-13", { bills: [weekly] }).map((a) => a.key)).toEqual(["bill:gym:2025-01-15"]);
  });

  it("before the projection start, looks ahead from the start date (reference date)", () => {
    const early = bill("early", 500, "ONE_TIME", "2025-01-02", { name: "Early" });
    expect(alertsFor("2024-12-01", { bills: [early] })[0].title).toBe("Early due tomorrow");
  });

  it("shows nothing once today is past the projection window", () => {
    expect(alertsFor("2025-04-02", { bills: [rent] })).toEqual([]);
  });
});

describe("buildAlerts: low balance", () => {
  // $300 opening, a $500 bill on Fri 01-10 -> -$200 at the end of that day.
  const big = bill("car", 50000, "ONE_TIME", "2025-01-10", { name: "Car" });
  const low = settings({ startingBalanceCents: 30000 });

  it("names the weekday the balance goes negative", () => {
    // Never recovers, so the stretch (and its key) lasts to the end of the 90-day window.
    expect(alertsFor("2025-01-06", { settings: low, bills: [big] })).toEqual([
      {
        key: "low-balance:2025-01-10",
        kind: "LOW_BALANCE",
        title: "Balance goes negative Friday",
        body: "Projected balance is -$200.00 at the end of Friday, Jan 10.",
        expiresOn: "2025-03-31",
      },
    ]);
  });

  it("says today and tomorrow, and a date when it is more than a week away", () => {
    expect(alertsFor("2025-01-10", { settings: low, bills: [big] })[0].title).toBe("Balance goes negative today");
    expect(alertsFor("2025-01-09", { settings: low, bills: [big] })[0].title).toBe("Balance goes negative tomorrow");
    expect(alertsFor("2025-01-02", { settings: low, bills: [big] })[0].title).toBe("Balance goes negative Jan 10");
  });

  it("ignores a negative balance that starts beyond the lookahead", () => {
    expect(LOW_BALANCE_LOOKAHEAD_DAYS).toBe(14);
    const later = bill("car", 50000, "ONE_TIME", "2025-01-20", { name: "Car" });
    expect(alertsFor("2025-01-05", { settings: low, bills: [later] })).toEqual([]);
    expect(alertsFor("2025-01-07", { settings: low, bills: [later] })).toHaveLength(1);
  });

  it("keeps one key for a negative stretch that began before today", () => {
    const first = alertsFor("2025-01-10", { settings: low, bills: [big] })[0];
    const later = alertsFor("2025-01-15", { settings: low, bills: [big] })[0];
    expect(later.key).toBe(first.key);
    expect(later.title).toBe("Balance is negative");
  });

  it("ends the key's life at the last day of the negative stretch", () => {
    // A $600 payday on 01-14 brings the balance back to +$400.
    const pay = income("pay", 60000, "ONE_TIME", "2025-01-14", { name: "Pay" });
    const [a] = alertsFor("2025-01-10", { settings: low, bills: [big], incomes: [pay] });
    expect(a.key).toBe("low-balance:2025-01-10");
    expect(a.expiresOn).toBe("2025-01-13");
  });

  it("treats a new negative stretch as a new alert", () => {
    const pay = income("pay", 60000, "ONE_TIME", "2025-01-14", { name: "Pay" });
    const again = bill("tax", 90000, "ONE_TIME", "2025-01-20", { name: "Tax" });
    const alerts = alertsFor("2025-01-16", { settings: low, bills: [big, again], incomes: [pay] });
    expect(alerts.map((a) => a.key)).toEqual(["low-balance:2025-01-20"]);
  });

  it("is quiet when the balance stays at or above zero", () => {
    const exact = bill("car", 30000, "ONE_TIME", "2025-01-10", { name: "Car" });
    expect(alertsFor("2025-01-06", { settings: low, bills: [exact] })).toEqual([]);
  });

  it("announces a starting balance that is already negative", () => {
    const [a] = alertsFor("2025-01-01", { settings: settings({ startingBalanceCents: -5000 }) });
    expect(a).toMatchObject({ key: "low-balance:2025-01-01", title: "Balance is negative" });
  });

  it("formats money in the settings currency", () => {
    const [a] = alertsFor("2025-01-06", { settings: { ...low, currency: "EUR" }, bills: [big] });
    expect(a.body).toContain("\u20ac200.00");
  });

  it("lists the balance alert before the bill alerts", () => {
    const alerts = alertsFor("2025-01-08", { settings: low, bills: [big] });
    expect(alerts.map((a) => a.kind)).toEqual(["LOW_BALANCE", "BILL_DUE"]);
  });
});
