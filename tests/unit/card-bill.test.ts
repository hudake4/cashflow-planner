import { describe, expect, it } from "vitest";
import { estimateCardBill, nextDayOfMonth, nextMonthlyDate } from "@/domain/card-bill";

describe("nextMonthlyDate", () => {
  it("keeps a date that is today or still ahead this month", () => {
    expect(nextMonthlyDate("2026-10-28", "2026-10-26")).toBe("2026-10-28");
    expect(nextMonthlyDate("2026-10-26", "2026-10-26")).toBe("2026-10-26");
  });

  it("rolls a date that already passed this month into next month", () => {
    expect(nextMonthlyDate("2026-10-15", "2026-10-26")).toBe("2026-11-15");
  });

  it("rolls a date entered months ago forward to the next occurrence", () => {
    expect(nextMonthlyDate("2026-03-09", "2026-10-26")).toBe("2026-11-09");
  });

  it("uses only the day of month of a date that is ahead of today", () => {
    // Cards bill every month, so a date entered for a later month still means "the 15th".
    expect(nextMonthlyDate("2027-02-15", "2026-10-26")).toBe("2026-11-15");
  });

  it("rolls over the year end", () => {
    expect(nextMonthlyDate("2026-10-15", "2026-12-20")).toBe("2027-01-15");
  });

  it("clamps day 31 to the end of short months", () => {
    expect(nextMonthlyDate("2026-01-31", "2026-02-10")).toBe("2026-02-28");
    expect(nextMonthlyDate("2026-01-31", "2026-04-10")).toBe("2026-04-30");
  });

  it("clamps to Feb 29 in a leap year and to Feb 28 otherwise", () => {
    expect(nextMonthlyDate("2027-01-31", "2028-02-10")).toBe("2028-02-29");
    expect(nextMonthlyDate("2027-01-31", "2027-02-10")).toBe("2027-02-28");
  });

  it("moves to the 31st of the next month once the clamped date has passed", () => {
    expect(nextMonthlyDate("2026-01-31", "2026-02-28")).toBe("2026-02-28");
    expect(nextMonthlyDate("2026-01-31", "2026-03-01")).toBe("2026-03-31");
  });

  it("treats a legacy day of month the same as a date with that day", () => {
    expect(nextDayOfMonth("2026-10-26", 15)).toBe("2026-11-15");
    expect(nextMonthlyDate("2000-01-15", "2026-10-26")).toBe(nextDayOfMonth("2026-10-26", 15));
  });
});

describe("estimateCardBill dates", () => {
  const base = { balanceCents: -50000, today: "2026-10-26" };

  it("closes on the next occurrence of the closing date and is due after it in the same month", () => {
    const est = estimateCardBill({ ...base, statementClosingAnchor: "2026-10-05", paymentDueAnchor: "2026-10-30" });
    expect(est.closingDate).toBe("2026-11-05");
    expect(est.dueDate).toBe("2026-11-30");
  });

  it("puts the due date in the month after closing when its day is not later than the closing day", () => {
    const est = estimateCardBill({ ...base, statementClosingAnchor: "2026-09-25", paymentDueAnchor: "2026-10-20" });
    expect(est.closingDate).toBe("2026-11-25");
    expect(est.dueDate).toBe("2026-12-20");
  });

  it("clamps both dates at month end", () => {
    const est = estimateCardBill({ ...base, today: "2027-02-01", statementClosingAnchor: "2026-10-31", paymentDueAnchor: "2026-11-30" });
    expect(est.closingDate).toBe("2027-02-28");
    expect(est.dueDate).toBe("2027-03-30");
  });

  it("only counts recurring charges up to the rolled-forward closing date", () => {
    const est = estimateCardBill({
      ...base,
      statementClosingAnchor: "2026-08-30",
      paymentDueAnchor: "2026-09-20",
      charges: [
        { amountCents: 1000, date: "2026-10-28" },
        { amountCents: 2000, date: "2026-11-01" },
      ],
    });
    expect(est.closingDate).toBe("2026-10-30");
    expect(est.recurringChargesCents).toBe(1000);
    expect(est.projectedBillCents).toBe(51000);
  });
});
