import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillDTO, IncomeDTO, SettingsDTO } from "@/contracts/api";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ToastProvider } from "@/components/ui/toast";
import { buildDashboard } from "@/domain/dashboard";
import { bill, income, settings } from "../helpers/fixtures";

const { getDashboard, getScenarioDashboard, listBills, listIncome } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getScenarioDashboard: vi.fn(),
  listBills: vi.fn(),
  listIncome: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    api: { ...actual.api, getDashboard, getScenarioDashboard, listBills, listIncome },
  };
});

// recharts needs ResizeObserver, which jsdom lacks. Report only whether the chart is
// receiving a scenario preview, so the test can assert the clear-scenario behavior.
vi.mock("@/components/dashboard/trend-chart", () => ({
  TrendChart: ({ scenarioDashboard }: { scenarioDashboard?: unknown }) => (
    <div data-testid="trend-scenario-state">{scenarioDashboard ? "active" : "inactive"}</div>
  ),
}));

const fullSettings = (): SettingsDTO => ({
  ...settings({ forecastDays: 30 }),
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 0, debtMonthlyPaymentCents: 50000,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  accountsBalanceDate: null,
  accountsStaleCount: 0,
  updatedAt: null,
});

const bills: BillDTO[] = [
  { id: "gym", name: "Gym", amountCents: 1000, frequency: "WEEKLY", anchorDate: "2025-01-01", endDate: null, category: null, notes: null, active: true, createdAt: "x", updatedAt: "x" },
];
const incomes: IncomeDTO[] = [
  { id: "pay", name: "Paycheck", amountCents: 50000, frequency: "WEEKLY", anchorDate: "2025-01-03", endDate: null, active: true, notes: null, createdAt: "x", updatedAt: "x" },
];

const dashboard = buildDashboard({
  settings: fullSettings(),
  incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
  bills: [bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" })],
  occurrences: [],
  today: "2025-01-08",
});

const renderDashboard = async () => {
  getDashboard.mockResolvedValue(dashboard);
  getScenarioDashboard.mockResolvedValue(dashboard);
  listBills.mockResolvedValue(bills);
  listIncome.mockResolvedValue(incomes);
  render(
    <ToastProvider>
      <DashboardView />
    </ToastProvider>,
  );
  await screen.findByTestId("summary-card-starting-balance");
};

beforeEach(() => {
  getDashboard.mockReset();
  getScenarioDashboard.mockReset();
  listBills.mockReset();
  listIncome.mockReset();
});

describe("Dashboard: what-if scenario", () => {
  it("clears the scenario preview from the projected balance immediately", async () => {
    const user = userEvent.setup();
    await renderDashboard();

    expect(screen.getByTestId("trend-scenario-state")).toHaveTextContent("inactive");

    await user.click(screen.getByTestId("what-if-button"));
    // The dialog resets its kind when the bill/income lists arrive, so wait for them first.
    await waitFor(() => expect(listBills).toHaveBeenCalled());
    await waitFor(() => expect(listIncome).toHaveBeenCalled());

    await user.selectOptions(screen.getByTestId("scenario-kind"), "REMOVE_BILL");
    await screen.findByRole("option", { name: "Gym" });
    await user.click(screen.getByTestId("scenario-apply"));

    expect(await screen.findByTestId("scenario-active")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("trend-scenario-state")).toHaveTextContent("active"));

    await user.click(screen.getByTestId("scenario-clear"));

    expect(screen.queryByTestId("scenario-active")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scenario-clear")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("trend-scenario-state")).toHaveTextContent("inactive"));
  });
});
