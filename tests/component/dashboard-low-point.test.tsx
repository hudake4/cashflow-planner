import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ToastProvider } from "@/components/ui/toast";
import { buildDashboard } from "@/domain/dashboard";
import { bill, income, settings } from "../helpers/fixtures";

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-client")>()), api: { ...(await importOriginal<typeof import("@/lib/api-client")>()).api, getDashboard } }));
vi.mock("@/components/dashboard/trend-chart", () => ({ TrendChart: () => null }));

describe("Dashboard low-point bills", () => {
  beforeEach(() => getDashboard.mockReset());

  it("renders the payday move impact card and hides it when there is no insight", async () => {
    const s = { ...settings({ forecastDays: 30 }), defaultCalendarView: "month" as const, desktopNotifications: true, balanceFloorCents: 0, startingBalanceSource: "MANUAL" as const, accountsBalanceCents: null, accountCount: 0, accountsBalanceDate: null, accountsStaleCount: 0, updatedAt: null };
    getDashboard.mockResolvedValue(buildDashboard({ settings: s, incomes: [income("pay", 50000, "ONE_TIME", "2025-01-05", { name: "Payday" })], bills: [bill("large", 80000, "ONE_TIME", "2025-01-04", { name: "Large bill" })], occurrences: [], today: "2025-01-01" }));
    render(<ToastProvider><DashboardView /></ToastProvider>);
    const card = await screen.findByTestId("low-point-bills");
    expect(card).toHaveTextContent("Bills behind your lowest point");
    expect(card).toHaveTextContent("If due on payday (Jan 5, 2025): lowest");
    expect(card).toHaveTextContent("on Sun, Jan 5");
    expect(await screen.findByTestId("low-point-bill-BILL:large:2025-01-04")).toBeInTheDocument();
    expect(card).toHaveTextContent("Moving a due date only works if the biller allows it.");
  });

  it("hides the card when the loaded dashboard has no low point", async () => {
    const s = { ...settings({ forecastDays: 30 }), defaultCalendarView: "month" as const, desktopNotifications: true, balanceFloorCents: 0, startingBalanceSource: "MANUAL" as const, accountsBalanceCents: null, accountCount: 0, accountsBalanceDate: null, accountsStaleCount: 0, updatedAt: null };
    getDashboard.mockResolvedValue(buildDashboard({ settings: s, incomes: [], bills: [bill("large", 80000, "ONE_TIME", "2025-01-04", { name: "Large bill" })], occurrences: [], today: "2025-01-01" }));
    render(<ToastProvider><DashboardView /></ToastProvider>);
    expect(await screen.findByTestId("upcoming-bills")).toBeInTheDocument();
    expect(screen.queryByTestId("low-point-bills")).toBeNull();
  });
});
