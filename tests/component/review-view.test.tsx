import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewComparisonDTO, ReviewResponse } from "@/contracts/api";
import { ReviewView } from "@/components/review/review-view";
import { ApiError } from "@/lib/api-client";

const { getReview } = vi.hoisted(() => ({ getReview: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getReview } };
});

beforeEach(() => {
  getReview.mockReset();
});

const MONTH: ReviewComparisonDTO = {
  current: { from: "2026-11-01", to: "2026-11-03", incomeCents: 250000, billsCents: 90000, billsCount: 1, spendingCents: 95500, netCents: 154500 },
  previous: { from: "2026-10-01", to: "2026-10-31", incomeCents: 480000, billsCents: 178000, billsCount: 2, spendingCents: 310000, netCents: 170000 },
  previousToDate: { incomeCents: 240000, billsCents: 90000, billsCount: 1, spendingCents: 120000, netCents: 120000 },
  categories: [
    { category: "BILLS", currentCents: 90000, previousCents: 178000 },
    { category: "GROCERIES", currentCents: 4500, previousCents: 60000 },
    { category: "ENTERTAINMENT", currentCents: 0, previousCents: 1500 },
  ],
};

const WEEK: ReviewComparisonDTO = {
  current: { from: "2026-11-01", to: "2026-11-03", incomeCents: 250000, billsCents: 0, billsCount: 0, spendingCents: 5500, netCents: 244500 },
  previous: { from: "2026-10-25", to: "2026-10-31", incomeCents: 0, billsCents: 9000, billsCount: 1, spendingCents: 5500, netCents: -5500 },
  previousToDate: { incomeCents: 0, billsCents: 0, billsCount: 0, spendingCents: 5500, netCents: -5500 },
  categories: [{ category: "GROCERIES", currentCents: 4500, previousCents: 5500 }],
};

const response = (over: Partial<ReviewResponse> = {}): ReviewResponse => ({
  month: MONTH,
  week: WEEK,
  coverageStart: "2026-08-01",
  currency: "USD",
  connectionCount: 1,
  transactionCount: 60,
  lastSyncedAt: "2026-11-03T12:00:00.000Z",
  ...over,
});

describe("ReviewView", () => {
  it("shows a loading region, then the month with its figures compared with last month", async () => {
    getReview.mockResolvedValue(response());
    render(<ReviewView />);

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(await screen.findByTestId("review-view")).toBeInTheDocument();

    const panel = screen.getByTestId("review-panel-month");
    expect(within(panel).getByRole("heading", { name: "This month" })).toBeInTheDocument();
    expect(within(panel).getByTestId("review-period")).toHaveTextContent("Nov 1 – Nov 3 · compared with Oct 1 – Oct 31");
    expect(within(panel).getByTestId("review-income")).toHaveTextContent("$2,500.00");
    expect(within(panel).getByTestId("review-bills")).toHaveTextContent("$900.00");
    expect(within(panel).getByTestId("review-stat-bills")).toHaveTextContent("1 bill marked paid");
    expect(within(panel).getByTestId("review-spending")).toHaveTextContent("$955.00");
    expect(within(panel).getByTestId("review-net")).toHaveTextContent("$1,545.00");
    // Like-for-like comparison in words, with the previous month in full under it.
    expect(within(panel).getByTestId("review-income-compare")).toHaveTextContent("Up $100.00 vs $2,400.00 by this day last month");
    expect(within(panel).getByTestId("review-income-compare")).toHaveTextContent("Last month in full: $4,800.00");
    expect(within(panel).getByTestId("review-spending-compare")).toHaveTextContent("Down $245.00 vs $1,200.00 by this day last month");
    expect(within(panel).getByTestId("review-bills-compare")).toHaveTextContent("No change vs $900.00");
  });

  it("lists spending by category, largest this period first, including one with nothing this period", async () => {
    getReview.mockResolvedValue(response());
    render(<ReviewView />);
    await screen.findByTestId("review-view");

    const rows = screen.getAllByTestId("review-category-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Bills");
    expect(rows[0]).toHaveTextContent("$900.00");
    expect(rows[0]).toHaveTextContent("$1,780.00");
    expect(rows[2]).toHaveTextContent("Entertainment");
    expect(rows[2]).toHaveTextContent("$0.00");
  });

  it("switches to the week", async () => {
    getReview.mockResolvedValue(response());
    const user = userEvent.setup();
    render(<ReviewView />);
    await screen.findByTestId("review-view");

    await user.click(screen.getByTestId("review-mode-week"));

    const panel = screen.getByTestId("review-panel-week");
    expect(screen.queryByTestId("review-panel-month")).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(within(panel).getByTestId("review-period")).toHaveTextContent("Nov 1 – Nov 3 · compared with Oct 25 – Oct 31");
    expect(within(panel).getByTestId("review-income-compare")).toHaveTextContent("Up $2,500.00 vs $0.00 by this day last week");
    expect(within(panel).getByTestId("review-stat-bills")).toHaveTextContent("0 bills marked paid");
    expect(within(panel).getByTestId("review-net")).toHaveTextContent("$2,445.00");
  });

  it("says so when there is no spending in either period", async () => {
    const empty = { ...MONTH, categories: [] };
    getReview.mockResolvedValue(response({ month: empty }));
    render(<ReviewView />);

    expect(await screen.findByTestId("review-no-categories")).toHaveTextContent("No spending in this month or the last one.");
  });

  it("warns when the bank history starts after the previous period began", async () => {
    getReview.mockResolvedValue(response({ coverageStart: "2026-10-15" }));
    render(<ReviewView />);

    expect(await screen.findByTestId("review-coverage-warning")).toHaveTextContent("Your bank history starts on Oct 15, 2026, so last month's figures may be incomplete.");
  });

  it("asks to connect a bank when none is connected", async () => {
    getReview.mockResolvedValue(response({ connectionCount: 0 }));
    render(<ReviewView />);

    expect(await screen.findByTestId("review-empty-no-bank")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Institutions" })).toHaveAttribute("href", "/institutions");
    expect(screen.queryByTestId("review-view")).not.toBeInTheDocument();
  });

  it("shows an error with a retry when the recap can't load", async () => {
    getReview.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Could not read your transactions."));
    getReview.mockResolvedValue(response());
    const user = userEvent.setup();
    render(<ReviewView />);

    const error = await screen.findByTestId("error-state");
    expect(error).toHaveTextContent("Could not read your transactions.");
    await user.click(within(error).getByTestId("retry-button"));
    expect(await screen.findByTestId("review-view")).toBeInTheDocument();
  });
});
