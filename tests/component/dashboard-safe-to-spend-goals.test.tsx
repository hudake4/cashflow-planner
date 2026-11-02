import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavingsGoalDTO, SettingsDTO } from "@/contracts/api";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ToastProvider } from "@/components/ui/toast";
import { buildDashboard } from "@/domain/dashboard";
import { bill, income, settings } from "../helpers/fixtures";

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getDashboard } };
});

// recharts needs ResizeObserver, which jsdom lacks; the chart is not what these tests are about.
vi.mock("@/components/dashboard/trend-chart", () => ({ TrendChart: () => null }));

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

const goal = (id: string, name: string, targetAmountCents: number, targetDate: string): SavingsGoalDTO => ({
  id,
  name,
  targetAmountCents,
  targetDate,
  createdAt: "x",
  updatedAt: "x",
});

const renderWith = async (goals: SavingsGoalDTO[]) => {
  getDashboard.mockResolvedValue(
    buildDashboard({
      settings: fullSettings(),
      incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
      bills: [bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" })],
      occurrences: [],
      goals,
      today: "2025-01-01",
    }),
  );
  render(
    <ToastProvider>
      <DashboardView />
    </ToastProvider>,
  );
  return screen.findByTestId("safe-to-spend");
};

beforeEach(() => {
  getDashboard.mockReset();
});

describe("Dashboard: safe to spend and savings goals", () => {
  it("no goals: no goal lines at all", async () => {
    const card = await renderWith([]);
    expect(within(card).getByTestId("safe-to-spend-value")).toHaveTextContent("990.00");
    expect(within(card).queryByTestId("safe-to-spend-goals")).not.toBeInTheDocument();
  });

  it("an unsupported goal shows the set-aside and its weekly amount", async () => {
    const card = await renderWith([goal("car", "Car", 400000, "2025-01-29")]);
    expect(within(card).getByTestId("safe-to-spend-value")).toHaveTextContent("727.50");
    expect(within(card).getByTestId("safe-to-spend-set-aside")).toHaveTextContent("After $262.50 set aside this week for savings goals.");
    expect(within(card).getByTestId("safe-to-spend-goal-list")).toHaveTextContent("Car by");
    expect(within(card).getByTestId("safe-to-spend-goal-list")).toHaveTextContent("$262.50/week");
    expect(within(card).queryByTestId("safe-to-spend-goal-limit")).not.toBeInTheDocument();
  });

  it("a supported goal that caps the figure says so", async () => {
    const card = await renderWith([goal("fund", "Fund", 150000, "2025-01-15")]);
    expect(within(card).getByTestId("safe-to-spend-value")).toHaveTextContent("470.00");
    expect(within(card).getByTestId("safe-to-spend-goal-limit")).toHaveTextContent("Held to $470.00 so “Fund” stays on track.");
    expect(within(card).queryByTestId("safe-to-spend-set-aside")).not.toBeInTheDocument();
  });
});
