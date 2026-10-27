import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillDTO, RecurringSuggestionDTO, SubscriptionAuditResponse } from "@/contracts/api";
import { SubscriptionAuditView } from "@/components/subscriptions/subscription-audit";
import { ToastProvider } from "@/components/ui/toast";

const { getSubscriptions, dismissSubscription } = vi.hoisted(() => ({
  getSubscriptions: vi.fn(),
  dismissSubscription: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSubscriptions, dismissSubscription } };
});

beforeEach(() => {
  getSubscriptions.mockReset();
  dismissSubscription.mockReset();
  dismissSubscription.mockResolvedValue(undefined);
});

const DETECTED: RecurringSuggestionDTO = {
  key: "BILL:netflix com",
  kind: "BILL",
  name: "Netflix.com",
  amountCents: 1549,
  frequency: "MONTHLY",
  nextDate: "2026-11-03",
  occurrences: 2,
  seenDates: ["2026-09-03", "2026-10-03"],
  amountVaries: false,
};

const INCOME: RecurringSuggestionDTO = { ...DETECTED, key: "INCOME:acme", kind: "INCOME", name: "Acme Payroll" };

const TRACKED: BillDTO = {
  id: "b1",
  name: "Rent",
  amountCents: 120000,
  frequency: "MONTHLY",
  anchorDate: "2026-01-02",
  endDate: null,
  category: null,
  notes: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const response = (over: Partial<SubscriptionAuditResponse> = {}): SubscriptionAuditResponse => ({
  suggestions: [DETECTED],
  tracked: [TRACKED],
  currency: "USD",
  connectionCount: 1,
  transactionCount: 40,
  lastSyncedAt: null,
  ...over,
});

function renderView() {
  render(
    <ToastProvider>
      <SubscriptionAuditView />
    </ToastProvider>,
  );
  return userEvent.setup();
}

describe("SubscriptionAuditView", () => {
  it("shows the last sync date in the machine's local timezone", async () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "America/Chicago";
    try {
      expect(new Date("2026-03-05T02:30:00.000Z").getDate()).toBe(4);
      getSubscriptions.mockResolvedValue(response({ lastSyncedAt: "2026-03-05T02:30:00.000Z" }));
      renderView();

      expect(await screen.findByTestId("subscription-coverage")).toHaveTextContent("last updated Mar 4, 2026");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("lists detected charges and tracked bills, but not income", async () => {
    getSubscriptions.mockResolvedValue(response({ suggestions: [DETECTED, INCOME] }));
    renderView();

    expect(await screen.findByText("Netflix.com")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-coverage")).not.toHaveTextContent("last updated");
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.queryByText("Acme Payroll")).toBeNull();

    const rows = screen.getAllByTestId("subscription-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Netflix.com")).toBeInTheDocument();
    expect(within(rows[1]).getByTestId("tracked")).toHaveTextContent("Tracked");
  });

  it("dismisses a detected charge and removes it from the list", async () => {
    getSubscriptions.mockResolvedValue(response({ suggestions: [DETECTED] }));
    const user = renderView();

    expect(await screen.findByText("Netflix.com")).toBeInTheDocument();
    await user.click(screen.getByTestId("dismiss-subscription"));

    await waitFor(() => expect(dismissSubscription).toHaveBeenCalledWith("BILL:netflix com"));
    await waitFor(() => expect(screen.queryByText("Netflix.com")).toBeNull());
  });

  it("shows the no-bank empty state when nothing is connected or tracked", async () => {
    getSubscriptions.mockResolvedValue(response({ suggestions: [], tracked: [], connectionCount: 0, transactionCount: 0 }));
    renderView();

    expect(await screen.findByTestId("subscriptions-empty-no-bank")).toBeInTheDocument();
  });
});
