import { cloneElement, type ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardResponse } from "@/contracts/api";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { buildDashboard } from "@/domain/dashboard";
import { money, signedMoney } from "@/lib/format";
import { bill, income, settings } from "../helpers/fixtures";

// jsdom has no layout, so give the chart a fixed size instead of measuring its container.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 256 }),
  };
});

const build = (billCents: number): DashboardResponse =>
  buildDashboard({
    settings: { ...settings({ forecastDays: 14 }), balanceFloorCents: 0 } as never,
    incomes: [income("pay", 50000, "WEEKLY", "2025-01-03", { name: "Paycheck" })],
    bills: [bill("gym", billCents, "WEEKLY", "2025-01-01", { name: "Gym" })],
    occurrences: [],
    today: "2025-01-08",
  });

const original = build(1000);
const scenario = build(2500);

/** Moves the pointer onto the plot; recharts picks the nearest row from the pointer position. jsdom has no layout, so stub the measurements it reads. */
const hoverChart = async () => {
  const surface = document.querySelector(".recharts-wrapper") as HTMLElement;
  expect(surface).not.toBeNull();
  surface.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 256, width: 600, height: 256, toJSON: () => ({}) });
  Object.defineProperty(surface, "offsetWidth", { configurable: true, value: 600 });
  fireEvent.mouseEnter(surface, { clientX: 300, clientY: 100 });
  fireEvent.mouseMove(surface, { clientX: 300, clientY: 100 });
  return screen.findByTestId("trend-tooltip");
};

// The expandable table animates via motion, which calls window.scrollTo (not implemented in jsdom).
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

describe("TrendChart what-if", () => {
  it("shows the original and What-If balances and their difference when a scenario is active", async () => {
    render(<TrendChart dashboard={original} scenarioDashboard={scenario} />);
    const tooltip = await hoverChart();
    expect(tooltip).not.toBeNull();

    // Find the hovered row from the date the tooltip shows, then check both series for that same day.
    const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const index = original.trend.findIndex((p) => tooltip!.textContent!.includes(label(p.date)));
    expect(index).toBeGreaterThanOrEqual(0);
    const orig = original.trend[index].balanceCents;
    const whatIf = scenario.trend[index].balanceCents;
    expect(whatIf).not.toBe(orig);

    expect(tooltip).toHaveTextContent(`Original forecast${money(orig)}`);
    expect(tooltip).toHaveTextContent(`What-If forecast${money(whatIf)}`);
    expect(tooltip).toHaveTextContent(`Difference${signedMoney(whatIf - orig)}`);
    // One hover marker per line.
    expect(document.querySelectorAll(".recharts-active-dot")).toHaveLength(2);
  });

  it("keeps the single unlabeled balance when no scenario is active", async () => {
    render(<TrendChart dashboard={original} />);
    const tooltip = await hoverChart();
    expect(tooltip).not.toBeNull();
    expect(tooltip).not.toHaveTextContent("What-If forecast");
    expect(tooltip).not.toHaveTextContent("Original forecast");
  });

  it("adds a What-If column to the table view only while a scenario is active", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TrendChart dashboard={original} />);
    await user.click(screen.getByTestId("trend-table-toggle"));
    expect(screen.queryByRole("columnheader", { name: "What-If balance" })).not.toBeInTheDocument();

    rerender(<TrendChart dashboard={original} scenarioDashboard={scenario} />);
    expect(screen.getByRole("columnheader", { name: "What-If balance" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(original.trend.length + 1);
    expect(screen.getAllByText(money(scenario.trend[0].balanceCents)).length).toBeGreaterThan(0);
  });
});
