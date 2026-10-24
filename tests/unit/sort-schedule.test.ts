import { describe, expect, it } from "vitest";
import type { BillDTO } from "@/contracts/api";
import { nextSort, sortScheduleItems, type SortKey } from "@/lib/sort-schedule";

const bill = (over: Partial<BillDTO> & Pick<BillDTO, "id" | "name">): BillDTO => ({
  amountCents: 1000,
  frequency: "MONTHLY",
  anchorDate: "2026-11-01",
  endDate: null,
  category: null,
  notes: null,
  active: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const rent = bill({ id: "1", name: "Rent", amountCents: 120000, anchorDate: "2026-11-01", category: "Housing" });
const gym = bill({ id: "2", name: "gym", amountCents: 3000, frequency: "WEEKLY", anchorDate: "2026-10-15", endDate: "2027-01-01", category: "Health" });
const tax = bill({ id: "3", name: "Tax", amountCents: 50000, frequency: "YEARLY", anchorDate: "2027-04-15" });
const fee = bill({ id: "4", name: "Fee", amountCents: 500, frequency: "ONE_TIME", anchorDate: "2026-12-01", endDate: "2026-12-31" });
const phone = bill({ id: "5", name: "Phone", frequency: "BIWEEKLY", anchorDate: "2026-10-20", endDate: "2026-12-20", category: "Bills" });
const all = [rent, gym, tax, fee, phone];

const names = (key: SortKey, direction: "asc" | "desc") =>
  sortScheduleItems(all, { key, direction }).map((item) => item.name);

describe("sortScheduleItems", () => {
  it("returns the original order when no sort is set", () => {
    expect(sortScheduleItems(all, null)).toBe(all);
  });

  it("does not mutate the input", () => {
    sortScheduleItems(all, { key: "name", direction: "asc" });
    expect(all.map((item) => item.name)).toEqual(["Rent", "gym", "Tax", "Fee", "Phone"]);
  });

  it("sorts names alphabetically regardless of case, and in reverse", () => {
    expect(names("name", "asc")).toEqual(["Fee", "gym", "Phone", "Rent", "Tax"]);
    expect(names("name", "desc")).toEqual(["Tax", "Rent", "Phone", "gym", "Fee"]);
  });

  it("sorts amounts by value, not text", () => {
    expect(names("amount", "asc")).toEqual(["Fee", "Phone", "gym", "Tax", "Rent"]);
    expect(names("amount", "desc")).toEqual(["Rent", "Tax", "gym", "Phone", "Fee"]);
  });

  it("sorts frequency by cadence, shortest first", () => {
    expect(names("frequency", "asc")).toEqual(["Fee", "gym", "Phone", "Rent", "Tax"]);
    expect(names("frequency", "desc")).toEqual(["Tax", "Rent", "Phone", "gym", "Fee"]);
  });

  it("sorts first due date earliest or latest first", () => {
    expect(names("anchorDate", "asc")).toEqual(["gym", "Phone", "Rent", "Fee", "Tax"]);
    expect(names("anchorDate", "desc")).toEqual(["Tax", "Fee", "Rent", "Phone", "gym"]);
  });

  it("sorts end dates, keeping bills with no end (and one-time bills) last either way", () => {
    expect(names("endDate", "asc")).toEqual(["Phone", "gym", "Fee", "Rent", "Tax"]);
    expect(names("endDate", "desc")).toEqual(["gym", "Phone", "Fee", "Rent", "Tax"]);
  });

  it("sorts category alphabetically with uncategorised bills last either way", () => {
    expect(names("category", "asc")).toEqual(["Phone", "gym", "Rent", "Fee", "Tax"]);
    expect(names("category", "desc")).toEqual(["Rent", "gym", "Phone", "Fee", "Tax"]);
  });
});

describe("nextSort", () => {
  it("cycles ascending, descending, then off", () => {
    const first = nextSort(null, "name");
    expect(first).toEqual({ key: "name", direction: "asc" });
    const second = nextSort(first, "name");
    expect(second).toEqual({ key: "name", direction: "desc" });
    expect(nextSort(second, "name")).toBeNull();
  });

  it("starts ascending when a different column is chosen", () => {
    expect(nextSort({ key: "name", direction: "desc" }, "amount")).toEqual({ key: "amount", direction: "asc" });
  });
});
