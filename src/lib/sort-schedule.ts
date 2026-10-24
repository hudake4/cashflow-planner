import type { BillDTO, IncomeDTO } from "@/contracts/api";

export type ScheduleItem = BillDTO | IncomeDTO;
export type SortKey = "name" | "amount" | "frequency" | "anchorDate" | "endDate" | "category";
export type SortDirection = "asc" | "desc";
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Cadence order, shortest to longest, so "ascending" reads one-time → weekly → … → yearly. */
const FREQUENCY_ORDER: Record<ScheduleItem["frequency"], number> = {
  ONE_TIME: 0,
  WEEKLY: 1,
  BIWEEKLY: 2,
  MONTHLY: 3,
  QUARTERLY: 4,
  YEARLY: 5,
};

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** A missing value (no end date, no category) sorts last in both directions. */
function compareOptional<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number, sign: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b) * sign;
}

function endValue(item: ScheduleItem): string | null {
  return item.frequency === "ONE_TIME" ? null : item.endDate;
}

function categoryValue(item: ScheduleItem): string | null {
  return "category" in item && item.category ? item.category : null;
}

const compareText = (a: string, b: string) => collator.compare(a, b);

/** Returns a sorted copy; ties fall back to name, then id, so the order is stable between renders. */
export function sortScheduleItems(items: ScheduleItem[], sort: SortState | null): ScheduleItem[] {
  if (!sort) return items;
  const sign = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let result = 0;
    switch (sort.key) {
      case "name":
        result = compareText(a.name, b.name) * sign;
        break;
      case "amount":
        result = (a.amountCents - b.amountCents) * sign;
        break;
      case "frequency":
        result = (FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency]) * sign;
        break;
      case "anchorDate":
        result = compareText(a.anchorDate, b.anchorDate) * sign;
        break;
      case "endDate":
        result = compareOptional(endValue(a), endValue(b), compareText, sign);
        break;
      case "category":
        result = compareOptional(categoryValue(a), categoryValue(b), compareText, sign);
        break;
    }
    return result || compareText(a.name, b.name) || a.id.localeCompare(b.id);
  });
}

/** Click cycle for a header: ascending, then descending, then back to the saved order. */
export function nextSort(current: SortState | null, key: SortKey): SortState | null {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}
