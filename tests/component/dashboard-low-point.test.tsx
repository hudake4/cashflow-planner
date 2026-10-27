import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ToastProvider } from "@/components/ui/toast";
import { buildDashboard } from "@/domain/dashboard";
import { bill, income, settings } from "../helpers/fixtures";
import type { SettingsDTO } from "@/contracts/api";

const { getDashboard, getScenarioDashboard, listBills, listIncome } = vi.hoisted(() => ({ getDashboard: vi.fn(), getScenarioDashboard: vi.fn(), listBills: vi.fn(), listIncome: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getDashboard, getScenarioDashboard, listBills, listIncome } };
});
vi.mock("@/components/dashboard/trend-chart", () => ({ TrendChart: () => <div /> }));

const fullSettings = (): SettingsDTO => ({ ...settings({ forecastDays: 30 }), defaultCalendarView: "month", desktopNotifications: true, balanceFloorCents: 0, startingBalanceSource: "MANUAL", accountsBalanceCents: null, accountCount: 0, accountsBalanceDate: null, accountsStaleCount: 0, updatedAt: null });
const dashboard = (today: string) => buildDashboard({
  settings: fullSettings(), today,
  incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
  bills: [bill("rent", 40000, "ONE_TIME", "2025-01-02", { name: "Rent" })],
  occurrences: [],
});

beforeEach(() => {
  getDashboard.mockReset(); getScenarioDashboard.mockReset(); listBills.mockResolvedValue([]); listIncome.mockResolvedValue([]);
  getScenarioDashboard.mockResolvedValue(null);
});

describe("Dashboard low-point bills", () => {
  it("shows the bill and its moved low point", async () => {
    getDashboard.mockResolvedValue(dashboard("2025-01-01"));
    render(<ToastProvider><DashboardView /></ToastProvider>);
    const card = await screen.findByTestId("low-point-bills");
    expect(card).toHaveTextContent("Rent");
    expect(card).toHaveTextContent("Move to payday");
    expect(card).toHaveTextContent("lowest point becomes");
    expect(card).toHaveTextContent("You can only move a due date if your biller allows it.");
  });

  it("hides when the dashboard has no low-point suggestions", async () => {
    getDashboard.mockResolvedValue(dashboard("2025-01-29"));
    render(<ToastProvider><DashboardView /></ToastProvider>);
    await screen.findByTestId("summary-card-starting-balance");
    expect(screen.queryByTestId("low-point-bills")).not.toBeInTheDocument();
  });
});
