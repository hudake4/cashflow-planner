import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySummary, LedgerEvent, ProjectionResponse, SettingsDTO, WeekSummary } from "@/contracts/api";
import { CalendarPage } from "@/components/calendar/calendar-view";
import { ToastProvider } from "@/components/ui/toast";
import { addDays, eachDay, startOfWeek } from "@/lib/dates";

const { getSettings, getProjection } = vi.hoisted(() => ({ getSettings: vi.fn(), getProjection: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, getProjection } };
});

// A fixed "today" (a Wednesday, mid-month) so the events below always fall inside the visible month.
const TODAY = "2026-10-21";
const PAYDAY = addDays(TODAY, 1);
const RENT_DAY = addDays(TODAY, 2);
const START_BALANCE = 100_000;

const settings = (over: Partial<SettingsDTO> = {}): SettingsDTO => ({
  startingBalanceCents: START_BALANCE,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  projectionStartDate: TODAY,
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  updatedAt: null,
  ...over,
});

const event = (over: Partial<LedgerEvent> & Pick<LedgerEvent, "id" | "date" | "kind" | "name" | "amountCents" | "balanceAfterCents">): LedgerEvent => ({
  sourceId: over.id,
  category: null,
  frequency: "ONE_TIME",
  signedAmountCents: over.kind === "INCOME" ? over.amountCents : -over.amountCents,
  status: over.kind === "INCOME" ? "SCHEDULED" : "UPCOMING",
  included: true,
  amountOverridden: false,
  sequence: 0,
  ...over,
});

const PAYCHECK = event({ id: `INCOME:pay:${PAYDAY}`, date: PAYDAY, kind: "INCOME", name: "Paycheck", amountCents: 50_000, balanceAfterCents: 150_000 });
const RENT = event({ id: `BILL:rent:${RENT_DAY}`, date: RENT_DAY, kind: "BILL", name: "Rent", amountCents: 200_000, balanceAfterCents: -50_000 });
const EVENTS = [PAYCHECK, RENT];

/** A small consistent projection for whatever range the calendar asks for. */
function projectionFor(from: string, to: string): ProjectionResponse {
  let balance = START_BALANCE;
  const days: DaySummary[] = eachDay(from, to).map((date) => {
    const todays = EVENTS.filter((e) => e.date === date);
    const net = todays.reduce((sum, e) => sum + e.signedAmountCents, 0);
    const day: DaySummary = {
      date,
      openingBalanceCents: balance,
      incomeCents: todays.filter((e) => e.kind === "INCOME").reduce((s, e) => s + e.amountCents, 0),
      billsCents: todays.filter((e) => e.kind === "BILL").reduce((s, e) => s + e.amountCents, 0),
      netCents: net,
      closingBalanceCents: balance + net,
      eventIds: todays.map((e) => e.id),
    };
    balance += net;
    return day;
  });

  const weeks: WeekSummary[] = [];
  for (const day of days) {
    const weekStart = startOfWeek(day.date, 0);
    let week = weeks.find((w) => w.weekStart === weekStart);
    if (!week) {
      week = {
        weekStart,
        weekEnd: addDays(weekStart, 6),
        rangeStart: day.date,
        rangeEnd: day.date,
        partial: day.date !== weekStart,
        openingBalanceCents: day.openingBalanceCents,
        incomeCents: 0,
        billsCents: 0,
        netCents: 0,
        closingBalanceCents: day.openingBalanceCents,
        lowestBalanceCents: day.openingBalanceCents,
        hasNegative: false,
        eventIds: [],
      };
      weeks.push(week);
    }
    week.rangeEnd = day.date;
    week.incomeCents += day.incomeCents;
    week.billsCents += day.billsCents;
    week.netCents += day.netCents;
    week.closingBalanceCents = day.closingBalanceCents;
    week.lowestBalanceCents = Math.min(week.lowestBalanceCents, day.closingBalanceCents);
    week.hasNegative = week.lowestBalanceCents < 0;
    week.eventIds.push(...day.eventIds);
  }

  return {
    window: { startDate: TODAY, endDate: addDays(TODAY, 89), maxEndDate: addDays(TODAY, 365) },
    range: { from, to },
    currency: "USD",
    weekStartsOn: 0,
    startingBalanceCents: START_BALANCE,
    events: EVENTS.filter((e) => e.date >= from && e.date <= to),
    days,
    weeks,
    totals: {
      incomeCents: 0,
      billsCents: 0,
      netCents: 0,
      openingBalanceCents: START_BALANCE,
      endingBalanceCents: balance,
      lowestBalanceCents: 0,
      lowestBalanceDate: from,
      firstNegativeDate: null,
      negativeDayCount: 0,
    },
  };
}

function renderCalendar() {
  return render(
    <ToastProvider>
      <CalendarPage />
    </ToastProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(settings());
  getProjection.mockReset().mockImplementation(({ from, to }: { from: string; to: string }) => Promise.resolve(projectionFor(from, to)));
});

describe("calendar heatmap and register", () => {
  it("shows each projected day's balance, with an icon and minus sign when negative", async () => {
    renderCalendar();
    const negativeCell = await screen.findByTestId(`day-cell-${RENT_DAY}`);

    expect(within(negativeCell).getByTestId(`day-balance-${RENT_DAY}`)).toHaveTextContent("-$500.00");
    expect(negativeCell).toHaveTextContent("−$500");
    expect(negativeCell.querySelector("svg")).not.toBeNull();
    expect(within(negativeCell).getByRole("button")).toHaveAccessibleName(/negative balance -\$500\.00/);

    const healthy = screen.getByTestId(`day-cell-${PAYDAY}`);
    expect(healthy).toHaveTextContent("$1,500");
    expect(healthy.querySelector("svg")).toBeNull();
    expect(healthy.querySelector('[data-dot="INCOME"]')).not.toBeNull();
  });

  it("disables days before the projection start and shows no balance there", async () => {
    renderCalendar();
    await screen.findByTestId(`day-cell-${TODAY}`);
    const before = screen.getByTestId(`day-cell-${addDays(startOfWeek(TODAY, 0), -1)}`);
    expect(before).toHaveAttribute("data-state", "before-start");
    expect(within(before).getByRole("button")).toBeDisabled();
    expect(before.textContent).not.toMatch(/\$/);
  });

  it("opens that day's ledger when a day is selected, including a day with no events", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(await screen.findByTestId(`day-button-${RENT_DAY}`));
    const detail = await screen.findByTestId("day-detail");
    expect(within(detail).getByTestId("detail-opening")).toHaveTextContent("$1,500.00");
    expect(within(detail).getByTestId("detail-closing")).toHaveTextContent("-$500.00");
    expect(within(detail).getByTestId(`ledger-${RENT.id}`)).toBeInTheDocument();
    expect(within(detail).getByTestId(`ledger-balance-${RENT.id}`)).toHaveTextContent("-$500.00");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("day-detail")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId(`day-button-${RENT_DAY}`)).toHaveFocus());

    await user.click(screen.getByTestId(`day-button-${addDays(TODAY, 4)}`));
    const empty = await screen.findByTestId("day-detail");
    expect(within(empty).getByText("No income or bills in this period.")).toBeInTheDocument();
    expect(within(empty).getByTestId("detail-opening")).toHaveTextContent("-$500.00");
    expect(within(empty).getByTestId("detail-closing")).toHaveTextContent("-$500.00");
  });

  it("lists each week with its totals and events with running balances", async () => {
    renderCalendar();
    const row = await screen.findByTestId(`event-${RENT.id}`);

    expect(row).toHaveAttribute("data-kind", "BILL");
    expect(row).toHaveAttribute("data-status", "UPCOMING");
    expect(row).toHaveAccessibleName(/Rent, bill, minus \$2,000\.00, on .*, negative balance after -\$500\.00/);
    expect(within(row).getByText("−$2,000.00")).toBeInTheDocument();
    expect(screen.getByTestId(`event-balance-${RENT.id}`)).toHaveTextContent("-$500.00");
    expect(screen.getByTestId(`event-${PAYCHECK.id}`)).toHaveAttribute("data-kind", "INCOME");

    const weekStart = startOfWeek(RENT_DAY, 0);
    const header = screen.getByTestId(`week-summary-${weekStart}`);
    expect(header).toHaveTextContent(/Week of/);
    expect(screen.getByTestId(`week-income-${weekStart}`)).toHaveTextContent("+$500.00");
    expect(screen.getByTestId(`week-bills-${weekStart}`)).toHaveTextContent("−$2,000.00");
    expect(screen.getByTestId(`week-closing-${weekStart}`)).toHaveTextContent("-$500.00");
    expect(screen.getByTestId(`week-negative-${weekStart}`)).toHaveTextContent("Dips below zero (low -$500.00)");
  });

  it("opens the week ledger from a week header and the event dialog from a row", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(await screen.findByTestId(`week-summary-${startOfWeek(RENT_DAY, 0)}`));
    const weekDetail = await screen.findByTestId("week-detail");
    expect(within(weekDetail).getByTestId(`ledger-${PAYCHECK.id}`)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("week-detail")).not.toBeInTheDocument());

    await user.click(screen.getByTestId(`event-${PAYCHECK.id}`));
    expect(await screen.findByTestId("event-detail")).toBeInTheDocument();
  });

  it("collapses weeks before the projection start into one note and keeps empty weeks as a one-line note", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 30) }));
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");

    // Today is before the (shifted) projection start, so the current month starts with unprojected weeks.
    await waitFor(() => expect(screen.getByTestId("calendar-register")).toHaveTextContent(/before your projection start/));
    expect(screen.queryByTestId(`week-summary-${startOfWeek(TODAY, 0)}`)).not.toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-next"));
    await waitFor(() => expect(screen.getByTestId("calendar-register")).toHaveTextContent("No income or bills"));
  });

  it("week view shows only the selected week", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId(`day-cell-${TODAY}`);

    await user.click(screen.getByTestId("calendar-view-week"));
    await waitFor(() => expect(screen.getByTestId("calendar-week")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("calendar-heatmap").querySelectorAll("[data-testid^='day-cell-']")).toHaveLength(7));
    expect(screen.getByTestId("calendar-register").querySelectorAll("[data-testid^='week-summary-']")).toHaveLength(1);
  });
});
