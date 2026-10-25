import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsDTO } from "@/contracts/api";
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

const fullSettings = (over: Partial<SettingsDTO> = {}): SettingsDTO => ({
  ...settings({ forecastDays: 30 }),
  defaultCalendarView: "month",
  desktopNotifications: true,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  accountsBalanceDate: null,
  accountsStaleCount: 0,
  updatedAt: null,
  ...over,
});

/** What `/api/dashboard` returns: settings already carry the effective balance and start date. */
const dashboardFor = (over: Partial<SettingsDTO>) =>
  buildDashboard({
    settings: fullSettings(over),
    incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
    bills: [bill("gym", 1000, "WEEKLY", "2025-01-01", { name: "Gym" })],
    occurrences: [],
    today: "2025-01-08",
  });

const ACCOUNTS = {
  startingBalanceSource: "ACCOUNTS" as const,
  accountsBalanceCents: 100000,
  accountCount: 3,
  accountsBalanceDate: "2025-01-01",
};

const renderDashboard = async (over: Partial<SettingsDTO>) => {
  getDashboard.mockResolvedValue(dashboardFor(over));
  render(
    <ToastProvider>
      <DashboardView />
    </ToastProvider>,
  );
  return screen.findByTestId("summary-card-starting-balance");
};

beforeEach(() => {
  getDashboard.mockReset();
});

describe("Dashboard: starting balance line", () => {
  it("MANUAL: 'Entered by you' with an Update link to Settings", async () => {
    const line = await renderDashboard({});

    expect(line).toHaveTextContent("Entered by you, as of");
    expect(within(line).getByRole("link", { name: "Update" })).toHaveAttribute("href", "/settings");
    expect(within(line).queryByTestId("stale-accounts-note")).not.toBeInTheDocument();
  });

  it("ACCOUNTS: the bank total can't be edited in Settings, so the link goes to Institutions", async () => {
    const line = await renderDashboard(ACCOUNTS);

    expect(line).toHaveTextContent("Total of your bank accounts, as of");
    expect(within(line).getByRole("link", { name: "Refresh" })).toHaveAttribute("href", "/institutions");
    expect(within(line).queryByRole("link", { name: "Update" })).not.toBeInTheDocument();
    expect(within(line).queryByTestId("stale-accounts-note")).not.toBeInTheDocument();
  });

  it("ACCOUNTS with a stale account: says its balance is still counted", async () => {
    const line = await renderDashboard({ ...ACCOUNTS, accountsStaleCount: 1 });

    const note = within(line).getByTestId("stale-accounts-note");
    expect(note).toHaveTextContent("1 account hasn't refreshed in over a week; its balance is still counted.");
    expect(within(note).getByRole("link", { name: "Institutions page" })).toHaveAttribute("href", "/institutions");
  });

  it("ACCOUNTS without a bank account: the typed balance is used and the link goes to Settings", async () => {
    const line = await renderDashboard({ startingBalanceSource: "ACCOUNTS", accountsStaleCount: 1 });

    expect(line).toHaveTextContent("Entered by you, as of");
    expect(within(line).getByRole("link", { name: "Update" })).toHaveAttribute("href", "/settings");
    expect(within(line).queryByTestId("stale-accounts-note")).not.toBeInTheDocument();
  });
});
