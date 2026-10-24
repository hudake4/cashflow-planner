import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpendingPeriodDTO, SpendingResponse } from "@/contracts/api";
import { SpendingView } from "@/components/spending/spending-view";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

const { getSpending, setTransactionCategory } = vi.hoisted(() => ({ getSpending: vi.fn(), setTransactionCategory: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSpending, setTransactionCategory } };
});

beforeEach(() => {
  getSpending.mockReset();
  setTransactionCategory.mockReset();
});

const THIS_MONTH: SpendingPeriodDTO = {
  from: "2026-10-01",
  to: "2026-10-24",
  totalCents: 145000,
  transactionCount: 14,
  transfersCents: 0,
  categories: [
    { category: "GROCERIES", totalCents: 60000, transactionCount: 6 },
    { category: "OTHER", totalCents: 45000, transactionCount: 3 },
    { category: "DINING", totalCents: 40000, transactionCount: 5 },
  ],
  topMerchants: [
    { name: "Whole Foods", category: "GROCERIES", totalCents: 40000, transactionCount: 3 },
    { name: "Chipotle", category: "DINING", totalCents: 12000, transactionCount: 1 },
  ],
  transactions: [
    { id: "t2", date: "2026-10-12", name: "Chipotle", description: "CHIPOTLE 1234", cents: 12000, category: "DINING", source: "AUTO", merchantLearnable: true },
    { id: "t1", date: "2026-10-05", name: "Whole Foods", description: "WHOLEFDS #12", cents: 40000, category: "GROCERIES", source: "MERCHANT", merchantLearnable: true },
    { id: "t0", date: "2026-10-03", name: "Mystery", description: "12345", cents: 5000, category: "OTHER", source: "MANUAL", merchantLearnable: false },
  ],
};

const LAST_MONTH: SpendingPeriodDTO = {
  from: "2026-09-01",
  to: "2026-09-30",
  totalCents: 200000,
  transactionCount: 22,
  transfersCents: 0,
  categories: [
    { category: "GROCERIES", totalCents: 100000, transactionCount: 9 },
    { category: "GAS", totalCents: 50000, transactionCount: 4 },
    { category: "UTILITIES", totalCents: 50000, transactionCount: 2 },
  ],
  topMerchants: [{ name: "Shell", category: "GAS", totalCents: 50000, transactionCount: 4 }],
  transactions: [],
};

const response = (over: Partial<SpendingResponse> = {}): SpendingResponse => ({
  thisMonth: THIS_MONTH,
  lastMonth: LAST_MONTH,
  lastMonthToDateCents: 120000,
  coverageStart: "2026-08-01",
  currency: "USD",
  connectionCount: 1,
  transactionCount: 60,
  lastSyncedAt: "2026-10-24T12:00:00.000Z",
  ...over,
});

const EMPTY_PERIOD = (from: string, to: string): SpendingPeriodDTO => ({
  from,
  to,
  totalCents: 0,
  transactionCount: 0,
  transfersCents: 0,
  categories: [],
  topMerchants: [],
  transactions: [],
});

const thisPanel = () => screen.getByTestId("spending-period-this-month");
const lastPanel = () => screen.getByTestId("spending-period-last-month");

describe("SpendingView", () => {
  it("shows a loading region, then both periods with totals, labels, amounts and percentages", async () => {
    getSpending.mockResolvedValue(response());
    render(<SpendingView />);

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(await screen.findByTestId("spending-view")).toBeInTheDocument();
    expect(screen.queryByTestId("loading")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Spend Analyzer" })).toBeInTheDocument();

    // This month comes first, then last month.
    const this_ = thisPanel();
    const last = lastPanel();
    expect(this_.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(this_).getByRole("heading", { level: 2, name: "This month" })).toBeInTheDocument();
    expect(within(last).getByRole("heading", { level: 2, name: "Last month" })).toBeInTheDocument();
    expect(this_).toHaveTextContent("Oct 1 – Oct 24");
    expect(last).toHaveTextContent("Sep 1 – Sep 30");

    expect(screen.getByTestId("spending-total-this-month")).toHaveTextContent("$1,450.00");
    expect(screen.getByTestId("spending-total-last-month")).toHaveTextContent("$2,000.00");

    const rows = within(this_).getAllByTestId("spending-category-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Groceries");
    expect(rows[0]).toHaveTextContent("$600.00");
    expect(rows[0]).toHaveTextContent("41%");
    expect(rows[1]).toHaveTextContent("Other");
    expect(rows[1]).toHaveTextContent("$450.00");
    expect(rows[1]).toHaveTextContent("31%");
    expect(rows[2]).toHaveTextContent("Dining");
    expect(rows[2]).toHaveTextContent("$400.00");
    expect(rows[2]).toHaveTextContent("28%");

    const lastRows = within(last).getAllByTestId("spending-category-row");
    expect(lastRows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Groceries"),
      expect.stringContaining("Gas"),
      expect.stringContaining("Utilities"),
    ]);
    expect(lastRows[0]).toHaveTextContent("$1,000.00");
    expect(lastRows[0]).toHaveTextContent("50%");
    expect(lastRows[1]).toHaveTextContent("25%");
  });

  it("sizes each bar by its share of the period total", async () => {
    getSpending.mockResolvedValue(response());
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const [first] = within(lastPanel()).getAllByTestId("spending-category-row");
    const fill = first.querySelector<HTMLElement>("[style]");
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe("50%");
  });

  it("lists top merchants with category, count and amount", async () => {
    getSpending.mockResolvedValue(response());
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const merchants = within(thisPanel()).getAllByTestId("spending-merchant-row");
    expect(merchants).toHaveLength(2);
    expect(merchants[0]).toHaveTextContent("Whole Foods");
    expect(merchants[0]).toHaveTextContent("Groceries");
    expect(merchants[0]).toHaveTextContent("3 transactions");
    expect(merchants[0]).toHaveTextContent("$400.00");
    expect(merchants[1]).toHaveTextContent("Chipotle");
    expect(merchants[1]).toHaveTextContent("1 transaction");
    expect(merchants[1]).not.toHaveTextContent("1 transactions");
    expect(within(lastPanel()).getAllByTestId("spending-merchant-row")).toHaveLength(1);
  });

  it("points to Institutions when no bank is connected", async () => {
    getSpending.mockResolvedValue(
      response({ connectionCount: 0, transactionCount: 0, lastSyncedAt: null, coverageStart: null, thisMonth: EMPTY_PERIOD("2026-10-01", "2026-10-24"), lastMonth: EMPTY_PERIOD("2026-09-01", "2026-09-30") }),
    );
    render(<SpendingView />);

    const empty = await screen.findByTestId("spending-empty-no-bank");
    expect(empty).toHaveTextContent("Connect a bank to see your spending");
    expect(within(empty).getByRole("link")).toHaveAttribute("href", "/institutions");
    expect(screen.queryByTestId("spending-view")).toBeNull();
    expect(screen.queryByTestId("spending-empty-no-spend")).toBeNull();
  });

  it("explains when a bank is connected but there is no spending in either period", async () => {
    getSpending.mockResolvedValue(
      response({ thisMonth: EMPTY_PERIOD("2026-10-01", "2026-10-24"), lastMonth: EMPTY_PERIOD("2026-09-01", "2026-09-30"), lastMonthToDateCents: 0 }),
    );
    render(<SpendingView />);

    const empty = await screen.findByTestId("spending-empty-no-spend");
    expect(empty).toHaveTextContent("No spending to show yet");
    expect(screen.queryByTestId("spending-empty-no-bank")).toBeNull();
    expect(screen.queryByTestId("spending-view")).toBeNull();
  });

  it("still shows the page when only one period has spending", async () => {
    getSpending.mockResolvedValue(response({ thisMonth: EMPTY_PERIOD("2026-10-01", "2026-10-24") }));
    render(<SpendingView />);

    await screen.findByTestId("spending-view");
    expect(screen.getByTestId("spending-total-this-month")).toHaveTextContent("$0.00");
    expect(thisPanel()).toHaveTextContent("No spending in this period.");
    expect(within(thisPanel()).queryAllByTestId("spending-category-row")).toHaveLength(0);
    expect(within(lastPanel()).getAllByTestId("spending-category-row")).toHaveLength(3);
  });

  it("shows the transfers note only for periods with transfers", async () => {
    getSpending.mockResolvedValue(response({ lastMonth: { ...LAST_MONTH, transfersCents: 123456 } }));
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    expect(lastPanel()).toHaveTextContent("Transfers and card payments ($1,234.56) aren't counted as spending.");
    expect(thisPanel()).not.toHaveTextContent(/transfers and card payments/i);
  });

  it("never renders TRANSFERS as a category row", async () => {
    const withTransfers: SpendingPeriodDTO = {
      ...THIS_MONTH,
      categories: [{ category: "TRANSFERS", totalCents: 99900, transactionCount: 2 }, ...THIS_MONTH.categories],
    };
    getSpending.mockResolvedValue(response({ thisMonth: withTransfers }));
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const rows = within(thisPanel()).getAllByTestId("spending-category-row");
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row).not.toHaveTextContent(/transfers/i));
  });

  it.each([
    ["higher", 120000, "Up $250.00 vs $1,200.00 spent by this day last month"],
    ["lower", 200000, "Down $550.00 vs $2,000.00 spent by this day last month"],
    ["equal", 145000, "No change vs $1,450.00 spent by this day last month"],
  ])("compares this month with the same days last month: %s", async (_name, lastMonthToDateCents, expected) => {
    getSpending.mockResolvedValue(response({ lastMonthToDateCents }));
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const compare = screen.getByTestId("spending-compare");
    expect(compare).toHaveTextContent(expected);
    expect(thisPanel()).toContainElement(compare);
    expect(within(lastPanel()).queryByTestId("spending-compare")).toBeNull();
  });

  it("shows data coverage and a link to refresh, without a warning when last month is covered", async () => {
    getSpending.mockResolvedValue(response());
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const coverage = screen.getByTestId("spending-coverage");
    expect(coverage).toHaveTextContent("Based on transactions from Aug 1, 2026 to today (the app keeps the last 89 days)");
    expect(coverage).toHaveTextContent("last updated Oct 24, 2026");
    expect(screen.getByRole("link", { name: /refresh your bank/i })).toHaveAttribute("href", "/institutions");
    expect(screen.queryByTestId("spending-coverage-warning")).toBeNull();
  });

  it("warns that last month may be incomplete when history starts after last month began", async () => {
    getSpending.mockResolvedValue(response({ coverageStart: "2026-09-12" }));
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    const warning = screen.getByTestId("spending-coverage-warning");
    expect(warning).toHaveTextContent("Sep 12, 2026");
    expect(warning).toHaveTextContent(/last month.*may be incomplete/i);
  });

  it("does not warn when history starts exactly on the first day of last month", async () => {
    getSpending.mockResolvedValue(response({ coverageStart: "2026-09-01" }));
    render(<SpendingView />);
    await screen.findByTestId("spending-view");

    expect(screen.queryByTestId("spending-coverage-warning")).toBeNull();
  });

  describe("changing categories", () => {
    const renderView = () =>
      render(
        <ToastProvider>
          <SpendingView />
        </ToastProvider>,
      );

    async function openDialogFor(user: ReturnType<typeof userEvent.setup>, name: string) {
      await screen.findByTestId("spending-view");
      await user.click(screen.getByTestId("spending-transactions-toggle-this-month"));
      const row = within(screen.getByTestId("spending-transactions-this-month"))
        .getAllByTestId("spending-transaction-row")
        .find((r) => r.textContent?.includes(name));
      await user.click(within(row!).getByTestId("spending-transaction-edit"));
      return screen.findByTestId("category-dialog");
    }

    it("keeps the transaction list collapsed until asked, then shows category and where it came from", async () => {
      getSpending.mockResolvedValue(response());
      const user = userEvent.setup();
      renderView();
      await screen.findByTestId("spending-view");

      const toggle = screen.getByTestId("spending-transactions-toggle-this-month");
      expect(toggle).toHaveTextContent("Review categories (3)");
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByTestId("spending-transactions-this-month")).toBeNull();

      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const rows = within(screen.getByTestId("spending-transactions-this-month")).getAllByTestId("spending-transaction-row");
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent("Chipotle");
      expect(rows[0]).toHaveTextContent("Dining");
      expect(rows[0]).not.toHaveTextContent(/learned|set by you/i);
      expect(rows[1]).toHaveTextContent("Learned");
      expect(rows[2]).toHaveTextContent("Set by you");
      // Last month has no transactions, so no toggle.
      expect(screen.queryByTestId("spending-transactions-toggle-last-month")).toBeNull();
    });

    it("saves the new category for the merchant by default and shows the refreshed analysis", async () => {
      getSpending.mockResolvedValue(response());
      const refreshed = response({ thisMonth: { ...THIS_MONTH, totalCents: 145000, categories: [{ category: "HEALTH", totalCents: 145000, transactionCount: 14 }] } });
      setTransactionCategory.mockResolvedValue(refreshed);
      const user = userEvent.setup();
      renderView();

      const dialog = await openDialogFor(user, "Chipotle");
      expect(within(dialog).getByTestId("category-select")).toHaveValue("DINING");
      expect(within(dialog).getByTestId("category-apply-merchant")).toBeChecked();
      expect(within(dialog).queryByTestId("category-reset")).toBeNull();

      await user.selectOptions(within(dialog).getByTestId("category-select"), "HEALTH");
      await user.click(within(dialog).getByTestId("category-save"));

      expect(setTransactionCategory).toHaveBeenCalledWith("t2", { category: "HEALTH", applyToMerchant: true });
      await waitFor(() => expect(screen.queryByTestId("category-dialog")).toBeNull());
      expect(getSpending).toHaveBeenCalledTimes(1);
      const rows = within(thisPanel()).getAllByTestId("spending-category-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Health");
    });

    it("can limit the change to one transaction", async () => {
      getSpending.mockResolvedValue(response());
      setTransactionCategory.mockResolvedValue(response());
      const user = userEvent.setup();
      renderView();

      const dialog = await openDialogFor(user, "Whole Foods");
      await user.click(within(dialog).getByTestId("category-apply-merchant"));
      await user.selectOptions(within(dialog).getByTestId("category-select"), "SHOPPING");
      await user.click(within(dialog).getByTestId("category-save"));

      expect(setTransactionCategory).toHaveBeenCalledWith("t1", { category: "SHOPPING", applyToMerchant: false });
    });

    it("offers a reset to automatic for a category the user set or taught, never a merchant switch without a name", async () => {
      getSpending.mockResolvedValue(response());
      setTransactionCategory.mockResolvedValue(response());
      const user = userEvent.setup();
      renderView();

      const dialog = await openDialogFor(user, "Mystery");
      expect(within(dialog).queryByTestId("category-apply-merchant")).toBeNull();
      await user.click(within(dialog).getByTestId("category-reset"));

      expect(setTransactionCategory).toHaveBeenCalledWith("t0", { category: null, applyToMerchant: false });
      await waitFor(() => expect(screen.queryByTestId("category-dialog")).toBeNull());
    });

    it("keeps the dialog open and explains when saving fails", async () => {
      getSpending.mockResolvedValue(response());
      setTransactionCategory.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Transaction not found."));
      const user = userEvent.setup();
      renderView();

      const dialog = await openDialogFor(user, "Chipotle");
      await user.click(within(dialog).getByTestId("category-save"));

      expect(await within(dialog).findByTestId("form-error")).toHaveTextContent("Transaction not found.");
      expect(screen.getByTestId("category-dialog")).toBeInTheDocument();
    });
  });

  it("shows an error with a retry that loads the data", async () => {
    getSpending.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Could not read your transactions."));
    getSpending.mockResolvedValue(response());
    const user = userEvent.setup();
    render(<SpendingView />);

    const error = await screen.findByTestId("error-state");
    expect(error).toHaveTextContent("Could not read your transactions.");
    expect(screen.queryByTestId("spending-view")).toBeNull();

    await user.click(within(error).getByTestId("retry-button"));

    expect(await screen.findByTestId("spending-view")).toBeInTheDocument();
    expect(getSpending).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("error-state")).toBeNull();
  });
});
