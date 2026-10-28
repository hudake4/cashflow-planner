import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySummary, LedgerEvent, ProjectionResponse, SettingsDTO, WeekSummary } from "@/contracts/api";
import { CalendarPage } from "@/components/calendar/calendar-view";
import { ToastProvider } from "@/components/ui/toast";
import { addDays, eachDay, fmtDate, startOfWeek } from "@/lib/dates";

const { getSettings, getProjection, downloadRegisterCsv, downloadMonthlySummary } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getProjection: vi.fn(),
  downloadRegisterCsv: vi.fn(),
  downloadMonthlySummary: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, getProjection, downloadRegisterCsv, downloadMonthlySummary } };
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
  accountsBalanceDate: null,
  accountsStaleCount: 0,
  projectionStartDate: TODAY,
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  balanceFloorCents: 0,
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

interface ProjectionOptions {
  events?: LedgerEvent[];
  startBalance?: number;
  weekStartsOn?: number;
}

/** A small consistent projection for whatever range the calendar asks for. */
function projectionFor(from: string, to: string, { events = EVENTS, startBalance = START_BALANCE, weekStartsOn = 0 }: ProjectionOptions = {}): ProjectionResponse {
  let balance = startBalance;
  const days: DaySummary[] = eachDay(from, to).map((date) => {
    const todays = events.filter((e) => e.date === date);
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
    const weekStart = startOfWeek(day.date, weekStartsOn);
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
    weekStartsOn,
    startingBalanceCents: startBalance,
    events: events.filter((e) => e.date >= from && e.date <= to),
    days,
    weeks,
    totals: {
      incomeCents: 0,
      billsCents: 0,
      netCents: 0,
      openingBalanceCents: startBalance,
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

  it("starts at the oldest bank balance date when balances come from the accounts, not at the typed date", async () => {
    const bankDate = addDays(TODAY, -3);
    getSettings.mockResolvedValue(
      settings({ startingBalanceSource: "ACCOUNTS", accountsBalanceCents: 90_000, accountCount: 1, accountsBalanceDate: bankDate }),
    );
    renderCalendar();
    await screen.findByTestId(`day-cell-${bankDate}`);

    expect(screen.getByTestId(`day-cell-${bankDate}`)).toHaveAttribute("data-state", "projected");
    expect(screen.getByTestId(`day-cell-${addDays(bankDate, -1)}`)).toHaveAttribute("data-state", "before-start");
    expect(getProjection.mock.calls.every(([range]) => range.from >= bankDate)).toBe(true);
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

  describe("Paid note in the event dialog", () => {
    const PAID_RENT = { ...RENT, status: "PAID" as const };
    const openPaid = async () => {
      getProjection.mockImplementation(({ from, to }: { from: string; to: string }) =>
        Promise.resolve(projectionFor(from, to, { events: [PAYCHECK, PAID_RENT] })),
      );
      renderCalendar();
      await userEvent.setup().click(await screen.findByTestId(`event-${PAID_RENT.id}`));
      return screen.findByTestId("event-detail");
    };

    it("MANUAL: still tells the user to update the starting balance and start date in Settings", async () => {
      const detail = await openPaid();
      expect(detail).toHaveTextContent("update the starting balance and start date in Settings");
    });

    it("ACCOUNTS: no longer tells the user to edit values Settings can't change", async () => {
      getSettings.mockResolvedValue(
        settings({ startingBalanceSource: "ACCOUNTS", accountsBalanceCents: 90_000, accountCount: 1, accountsBalanceDate: TODAY }),
      );
      const detail = await openPaid();
      expect(detail).toHaveTextContent("The bill still counts once on its due date.");
      expect(detail).toHaveTextContent("it catches up when they refresh");
      expect(detail).not.toHaveTextContent(/update the starting balance/i);
    });
  });

  it("collapses weeks before the projection start into one note and keeps empty weeks as a one-line note", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 30) }));
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");

    // The whole current month is before the (shifted) projection start: the page says so once, and the register adds no note.
    expect(await screen.findByText(/before your projection start date, so there's no projected balance/)).toBeInTheDocument();
    expect(screen.getByTestId("calendar-register")).not.toHaveTextContent(/before your projection start/);
    expect(screen.queryByTestId(`week-summary-${startOfWeek(TODAY, 0)}`)).not.toBeInTheDocument();

    // Next month mixes unprojected weeks with the partial first projected week, so the note is useful there.
    await user.click(screen.getByTestId("calendar-next"));
    await waitFor(() => expect(screen.getByTestId("calendar-register")).toHaveTextContent("No income or bills"));
    expect(screen.getByTestId("calendar-register")).toHaveTextContent(/2 earlier weeks are before your projection start\./);
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

describe("heatmap weeks before the projection start on phones", () => {
  it("marks fully-before-start weeks to hide below lg, keeps their cells in the DOM, and keeps the partial first week", async () => {
    renderCalendar();
    await screen.findByTestId(`day-cell-${TODAY}`);

    const partialWeek = startOfWeek(TODAY, 0);
    const fullyBefore = [addDays(partialWeek, -21), addDays(partialWeek, -14), addDays(partialWeek, -7)];
    for (const weekStart of fullyBefore) {
      const row = screen.getByTestId(`heatmap-week-${weekStart}`);
      expect(row).toHaveAttribute("data-week-collapsed-on-phone", "true");
      expect(row).toHaveClass("hidden", "lg:contents");
      expect(within(row).getAllByTestId(/^day-cell-/)).toHaveLength(7);
      expect(within(row).getAllByTestId(/^day-cell-/).every((cell) => cell.dataset.state === "before-start")).toBe(true);
    }

    const partial = screen.getByTestId(`heatmap-week-${partialWeek}`);
    expect(partial).not.toHaveAttribute("data-week-collapsed-on-phone");
    expect(partial).toHaveClass("contents");
    expect(partial).not.toHaveClass("hidden");
    expect(within(partial).getByTestId(`day-cell-${addDays(partialWeek, 1)}`)).toHaveAttribute("data-state", "before-start");
    expect(screen.getByTestId(`heatmap-week-${addDays(partialWeek, 7)}`)).not.toHaveAttribute("data-week-collapsed-on-phone");
  });

  it("hides nothing when every visible week is before the projection start", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 60) }));
    renderCalendar();
    await screen.findByTestId(`day-cell-${TODAY}`);

    const rows = screen.getByTestId("calendar-heatmap").querySelectorAll("[data-testid^='heatmap-week-']");
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(row).not.toHaveAttribute("data-week-collapsed-on-phone");
      expect(row).not.toHaveClass("hidden");
    }
  });
});

function mockProjection(options: ProjectionOptions) {
  getProjection.mockReset().mockImplementation(({ from, to }: { from: string; to: string }) => Promise.resolve(projectionFor(from, to, options)));
}

describe("week header accessible name", () => {
  const weekStart = startOfWeek(TODAY, 0);

  it("announces the dip warning with its low value, and a negative closing balance, but not a positive opening", async () => {
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(header).toHaveAccessibleName(/opening \$1,000\.00, income/);
    expect(header).toHaveAccessibleName(/closing negative balance -\$500\.00/);
    expect(header).toHaveAccessibleName(/dips below zero, low negative balance -\$500\.00/i);
    expect(header).toHaveAccessibleName(/Open week details\.$/);
  });

  it("says negative balance for both a negative opening and a negative closing", async () => {
    mockProjection({ events: [], startBalance: -70_000 });
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(header).toHaveAccessibleName(/opening negative balance -\$700\.00/);
    expect(header).toHaveAccessibleName(/closing negative balance -\$700\.00/);
    expect(header).toHaveAccessibleName(/dips below zero, low negative balance -\$700\.00/i);
  });

  it("announces the week's net, saying negative for a net loss, to match the visible Net amount", async () => {
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(screen.getByTestId(`week-net-${weekStart}`)).toHaveTextContent("−$1,500.00");
    expect(header).toHaveAccessibleName(/closing negative balance -\$500\.00, net negative -\$1,500\.00/);
  });

  it("announces a positive net without the word negative, and a zero net as $0.00", async () => {
    mockProjection({ events: [PAYCHECK] });
    const { unmount } = renderCalendar();
    const gain = await screen.findByTestId(`week-summary-${weekStart}`);
    expect(screen.getByTestId(`week-net-${weekStart}`)).toHaveTextContent("+$500.00");
    expect(gain).toHaveAccessibleName(/closing \$1,500\.00, net \$500\.00/);
    expect(gain).not.toHaveAccessibleName(/net negative/);
    unmount();

    mockProjection({ events: [] });
    renderCalendar();
    const flat = await screen.findByTestId(`week-summary-${weekStart}`);
    expect(flat).toHaveAccessibleName(/closing \$1,000\.00, net \$0\.00/);
  });

  it("says nothing about negative balances or dips for a healthy week", async () => {
    mockProjection({ events: [] });
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(header).not.toHaveAccessibleName(/negative balance/);
    expect(header).not.toHaveAccessibleName(/dips below zero/i);
    expect(header).toHaveAccessibleName(/opening \$1,000\.00, .*closing \$1,000\.00/);
  });
});

describe.each([
  { weekStartsOn: 0, label: "Week of Oct 18", covers: "Oct 21 – Oct 24, 2026" },
  { weekStartsOn: 1, label: "Week of Oct 19", covers: "Oct 21 – Oct 25, 2026" },
])("partial first week label (week starts on day $weekStartsOn)", ({ weekStartsOn, label, covers }) => {
  const weekStart = startOfWeek(TODAY, weekStartsOn);

  beforeEach(() => {
    getSettings.mockResolvedValue(settings({ weekStartsOn }));
    mockProjection({ weekStartsOn });
  });

  it(`names the week "${label}" in the header, its accessible name, the register section and the drawer title`, async () => {
    const user = userEvent.setup();
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(header).toHaveTextContent(label);
    expect(header).toHaveTextContent("(partial)");
    expect(header).toHaveAccessibleName(new RegExp(`^${label} \\(partial, covers ${covers}\\): opening `));
    const section = screen.getByTestId(`week-register-${weekStart}`);
    expect(section).toHaveAttribute("aria-label", label);
    expect(screen.getByRole("region", { name: label })).toBe(section);
    expect(screen.getByTestId("calendar-negative-warning")).toHaveTextContent(`week of ${label.replace("Week of ", "")}`);

    await user.click(header);
    const detail = await screen.findByTestId("week-detail");
    expect(detail).toHaveAccessibleName(label);
    expect(within(detail).getByRole("heading", { name: label })).toBeInTheDocument();
    expect(detail).toHaveAccessibleDescription(new RegExp(`${covers}.*Partial week`));
  });

  it("uses the same week-start label for every week in the register, not the covered range", async () => {
    renderCalendar();
    await screen.findByTestId(`week-summary-${weekStart}`);

    const headers = screen.getAllByTestId(/^week-summary-/);
    expect(headers.length).toBeGreaterThan(1);
    for (const header of headers) {
      const start = header.dataset.testid!.replace("week-summary-", "");
      const name = `Week of ${fmtDate(start, "MMM d")}`;
      expect(header).toHaveTextContent(name);
      expect(header.getAttribute("aria-label")).toMatch(new RegExp(`^${name}[ :(]`));
      expect(screen.getByTestId(`week-register-${start}`)).toHaveAttribute("aria-label", name);
    }
  });
});

describe("zero income and bills in the week header", () => {
  const weekStart = startOfWeek(TODAY, 0);

  it("shows a dash instead of +$0.00 and −$0.00, keeps the test ids, and says so to screen readers", async () => {
    mockProjection({ events: [] });
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    const income = screen.getByTestId(`week-income-${weekStart}`);
    const bills = screen.getByTestId(`week-bills-${weekStart}`);
    expect(income).toHaveTextContent("—");
    expect(bills).toHaveTextContent("—");
    expect(header).not.toHaveTextContent(/[+−]\$0\.00/);
    expect(income).toHaveTextContent("no income");
    expect(bills).toHaveTextContent("no bills");
    expect(header).toHaveAccessibleName(/opening \$1,000\.00, no income, no bills, closing \$1,000\.00/);
  });

  it("dashes only the zero side and leaves non-zero amounts as they were", async () => {
    mockProjection({ events: [PAYCHECK] });
    renderCalendar();
    const header = await screen.findByTestId(`week-summary-${weekStart}`);

    expect(screen.getByTestId(`week-income-${weekStart}`)).toHaveTextContent("+$500.00");
    expect(screen.getByTestId(`week-bills-${weekStart}`)).toHaveTextContent("—");
    expect(header).toHaveAccessibleName(/income \$500\.00, no bills/);
  });
});

describe("out-of-range message and register notes", () => {
  const jumpTo = async (date: string) => {
    fireEvent.change(screen.getByTestId("calendar-jump"), { target: { value: date } });
    await waitFor(() => expect(screen.getByTestId("calendar-title")).toHaveTextContent(fmtDate(date, "MMMM yyyy")));
  };

  it("shows only the Settings message, not the earlier-weeks note, when every visible day is before the projection start", async () => {
    renderCalendar();
    await screen.findByTestId("calendar-register");
    await jumpTo("2026-08-10");

    expect(await screen.findByText(/before your projection start date, so there's no projected balance/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change projection settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("calendar-register")).not.toHaveTextContent(/earlier weeks?/);
    expect(screen.queryByTestId("register-column-headings")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^week-summary-/)).not.toBeInTheDocument();
  });

  it("shows only the Settings message, not the later-weeks note, when every visible day is beyond the 12-month limit", async () => {
    renderCalendar();
    await screen.findByTestId("calendar-register");
    await jumpTo("2028-01-15");

    expect(await screen.findByText(/These dates are beyond the 12-month forecast limit\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change projection settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("calendar-register")).not.toHaveTextContent(/later weeks?/);
    expect(screen.queryByTestId("register-column-headings")).not.toBeInTheDocument();
  });

  it("shows the register column headings above a listed week, not only the 'Balance after' text every row carries", async () => {
    renderCalendar();
    await screen.findByTestId(`week-summary-${startOfWeek(TODAY, 0)}`);

    const headings = screen.getByTestId("register-column-headings");
    for (const name of ["Date", "Income or bill", "Amount", "Balance after"]) expect(headings).toHaveTextContent(name);
    expect(screen.getByTestId("calendar-register").contains(headings)).toBe(true);
  });

  it("keeps the later-weeks note, and no Settings message, when the view mixes projected and unprojected weeks", async () => {
    renderCalendar();
    await screen.findByTestId("calendar-register");
    await jumpTo("2027-10-26");

    await waitFor(() => expect(screen.getByTestId("calendar-register")).toHaveTextContent(/2 later weeks are beyond the 12-month forecast limit\./));
    expect(screen.getAllByTestId(/^week-summary-/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("register-column-headings")).toHaveTextContent("Balance after");
    expect(screen.queryByRole("link", { name: "Change projection settings" })).not.toBeInTheDocument();
  });

  it("keeps the earlier-weeks note, and no Settings message, when the view mixes projected and unprojected weeks", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 10) }));
    renderCalendar();

    await waitFor(() => expect(screen.getByTestId("calendar-register")).toHaveTextContent(/\d+ earlier weeks? (is|are) before your projection start\./));
    expect(screen.getAllByTestId(/^week-summary-/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Change projection settings" })).not.toBeInTheDocument();
  });
});

describe("calendar export menu", () => {
  let clicked: string[];

  beforeEach(() => {
    downloadRegisterCsv.mockReset().mockResolvedValue({ blob: new Blob(["x"]), filename: "cashflow-register-2026-10-21-to-2026-10-31.csv" });
    downloadMonthlySummary.mockReset().mockResolvedValue({ blob: new Blob(["x"]), filename: "cashflow-summary-2026-10.pdf" });
    // jsdom has no object URLs and does not navigate on a link click.
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:file"), revokeObjectURL: vi.fn() });
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
  });

  it("downloads the visible month's register, cut to the projection window, and its summary", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");

    await user.click(screen.getByTestId("calendar-export"));
    expect(within(await screen.findByRole("menu")).getByText("Oct 21 – Oct 31, 2026")).toBeInTheDocument();
    await user.click(screen.getByTestId("calendar-export-csv"));
    await waitFor(() => expect(clicked).toEqual(["cashflow-register-2026-10-21-to-2026-10-31.csv"]));
    expect(downloadRegisterCsv).toHaveBeenCalledWith({ from: "2026-10-21", to: "2026-10-31" });
    expect(await screen.findByText("Register downloaded.")).toBeInTheDocument();

    await user.click(screen.getByTestId("calendar-export"));
    await user.click(await screen.findByTestId("calendar-export-pdf"));
    await waitFor(() => expect(clicked).toHaveLength(2));
    expect(downloadMonthlySummary).toHaveBeenCalledWith("2026-10");
    expect(clicked[1]).toBe("cashflow-summary-2026-10.pdf");
  });

  it("follows the month being viewed", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");
    await user.click(screen.getByTestId("calendar-next"));
    await waitFor(() => expect(screen.getByTestId("calendar-title")).toHaveTextContent("November 2026"));

    await user.click(screen.getByTestId("calendar-export"));
    await user.click(await screen.findByTestId("calendar-export-csv"));
    await waitFor(() => expect(downloadRegisterCsv).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-30" }));
  });

  it("in week view exports the week cut to the projection window", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");
    await user.click(screen.getByTestId("calendar-view-week"));
    await waitFor(() => expect(screen.getByTestId("calendar-week")).toBeInTheDocument());

    // The week is Oct 18 - 24, but the projection starts Oct 21.
    await user.click(screen.getByTestId("calendar-export"));
    expect(within(await screen.findByRole("menu")).getByText("Oct 21 – Oct 24, 2026")).toBeInTheDocument();
    await user.click(screen.getByTestId("calendar-export-csv"));
    await waitFor(() => expect(downloadRegisterCsv).toHaveBeenCalledWith({ from: "2026-10-21", to: "2026-10-24" }));
    await user.click(screen.getByTestId("calendar-export"));
    await user.click(await screen.findByTestId("calendar-export-pdf"));
    await waitFor(() => expect(downloadMonthlySummary).toHaveBeenCalledWith("2026-10"));
  });

  it("in week view asks for the summary of the month the covered days are in, never one outside the window", async () => {
    // Monday weeks: the viewed day (Oct 28) is in Oct 26 - Nov 1, and only Nov 1 is inside the window.
    getSettings.mockResolvedValue(settings({ projectionStartDate: "2026-11-01", weekStartsOn: 1, defaultCalendarView: "week" }));
    getProjection.mockImplementation(async ({ from, to }: { from: string; to: string }) => projectionFor(from, to, { weekStartsOn: 1 }));
    const user = userEvent.setup();
    renderCalendar();
    await waitFor(() => expect(screen.getByTestId("calendar-week")).toBeInTheDocument());
    await user.click(screen.getByTestId("calendar-next"));
    await waitFor(() => expect(screen.getByTestId("calendar-title")).toHaveTextContent("Oct 26"));

    await user.click(screen.getByTestId("calendar-export"));
    expect(within(await screen.findByRole("menu")).getByText("Nov 1, 2026")).toBeInTheDocument();
    await user.click(screen.getByTestId("calendar-export-csv"));
    await waitFor(() => expect(downloadRegisterCsv).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-01" }));
    await user.click(screen.getByTestId("calendar-export"));
    await user.click(await screen.findByTestId("calendar-export-pdf"));
    await waitFor(() => expect(downloadMonthlySummary).toHaveBeenCalledWith("2026-11"));
    expect(downloadMonthlySummary).not.toHaveBeenCalledWith("2026-10");
  });

  it("is disabled in week view when the whole week lies outside the projection window", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 30), defaultCalendarView: "week" }));
    renderCalendar();
    await screen.findByTestId("calendar-register");
    expect(screen.getByTestId("calendar-export")).toBeDisabled();
  });

  it("is disabled when the period lies before the projection start", async () => {
    getSettings.mockResolvedValue(settings({ projectionStartDate: addDays(TODAY, 30) }));
    renderCalendar();
    await screen.findByTestId("calendar-register");
    expect(screen.getByTestId("calendar-export")).toBeDisabled();
  });

  it("shows the server's error and downloads nothing when the export fails", async () => {
    downloadMonthlySummary.mockRejectedValue(new Error("November 2027 is beyond the 12-month forecast limit."));
    const user = userEvent.setup();
    renderCalendar();
    await screen.findByTestId("calendar-register");

    await user.click(screen.getByTestId("calendar-export"));
    await user.click(await screen.findByTestId("calendar-export-pdf"));
    expect(await screen.findByText("November 2027 is beyond the 12-month forecast limit.")).toBeInTheDocument();
    expect(clicked).toEqual([]);
    expect(screen.getByTestId("calendar-export")).toBeEnabled();
  });
});
