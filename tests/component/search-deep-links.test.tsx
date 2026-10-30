import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankTransactionDTO,
  IncomeDTO,
  InstitutionDTO,
  ProjectionResponse,
  SavingsGoalDTO,
  SpendingPeriodDTO,
  SpendingResponse,
} from "@/contracts/api";
import { InstitutionsView } from "@/components/institutions/institutions-view";
import { TransactionHistory } from "@/components/institutions/transaction-history";
import { SavingsGoalsView } from "@/components/savings-goals/savings-goals-view";
import { ScheduleListPage } from "@/components/schedule/schedule-list-page";
import { SpendingView } from "@/components/spending/spending-view";
import { ToastProvider } from "@/components/ui/toast";

// The pages a command-palette result opens (CONVENTIONS section 20): each reads its parameter,
// marks the item, and removes the parameter from the address.

const fetchMock = vi.fn();
const scrollIntoView = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Routes fetch calls by "METHOD path" (query string included) so each test declares what it needs. */
function route(handlers: Record<string, (init?: RequestInit) => Response>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected request: ${key}`);
    return handler(init);
  });
}

/** Puts the deep link in the address the way a navigation would, so the replace call can be checked. */
const at = (url: string) => window.history.replaceState(null, "", url);
const replaced = () => vi.mocked(useRouter)().replace;

const linked = () => document.querySelectorAll("[data-linked]");

describe("Income and bills (?edit= and ?new=1)", () => {
  const PAY: IncomeDTO = {
    id: "inc1",
    name: "Acme Payroll",
    amountCents: 250000,
    frequency: "BIWEEKLY",
    anchorDate: "2026-10-02",
    endDate: null,
    active: true,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const OTHER: IncomeDTO = { ...PAY, id: "inc2", name: "Side gig" };

  const renderIncome = (props: { editId?: string; openNew?: boolean }) =>
    render(
      <ToastProvider>
        <ScheduleListPage kind="income" {...props} />
      </ToastProvider>,
    );

  beforeEach(() => {
    route({ "GET /income": () => json(200, [PAY, OTHER]), "GET /settings": () => json(200, { currency: "USD" }) });
  });

  it("opens the editor for the linked item, marks its row and clears the parameter", async () => {
    at("/income?edit=inc2");
    renderIncome({ editId: "inc2" });

    const dialog = await screen.findByRole("dialog", { name: "Edit income" });
    expect(within(dialog).getByTestId("income-name")).toHaveValue("Side gig");
    expect(screen.getByTestId("income-row-inc2")).toHaveAttribute("data-linked", "true");
    expect(screen.getByTestId("income-card-inc2")).toHaveAttribute("data-linked", "true");
    expect(screen.getByTestId("income-row-inc1")).not.toHaveAttribute("data-linked");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(replaced()).toHaveBeenCalledWith("/income", { scroll: false });
  });

  it("says so when the linked item no longer exists, and opens nothing", async () => {
    renderIncome({ editId: "gone" });
    expect(await screen.findByTestId("link-target-missing")).toHaveTextContent("That income source wasn't found");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linked()).toHaveLength(0);
  });

  it("opens the add dialog for ?new=1", async () => {
    at("/income?new=1");
    renderIncome({ openNew: true });
    expect(await screen.findByRole("dialog", { name: "Add income" })).toBeInTheDocument();
    expect(replaced()).toHaveBeenCalledWith("/income", { scroll: false });
  });

  it("opens nothing without a link", async () => {
    renderIncome({});
    expect(await screen.findByTestId("income-row-inc1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replaced()).not.toHaveBeenCalled();
  });
});

describe("Spend Analyzer (?tx=)", () => {
  const PERIOD = (from: string, to: string, transactions: SpendingPeriodDTO["transactions"]): SpendingPeriodDTO => ({
    from,
    to,
    totalCents: transactions.reduce((sum, t) => sum + t.cents, 0),
    transactionCount: transactions.length,
    transfersCents: 0,
    categories: [{ category: "DINING", totalCents: transactions.reduce((sum, t) => sum + t.cents, 0), transactionCount: transactions.length }],
    topMerchants: [],
    transactions,
  });
  const tx = (id: string, date: string, name: string) => ({
    id,
    date,
    name,
    description: name.toUpperCase(),
    cents: 1200,
    category: "DINING" as const,
    source: "AUTO" as const,
    merchantLearnable: true,
  });
  const SPENDING: SpendingResponse = {
    thisMonth: PERIOD("2026-10-01", "2026-10-24", [tx("t1", "2026-10-12", "Chipotle")]),
    lastMonth: PERIOD("2026-09-01", "2026-09-30", [tx("t2", "2026-09-20", "Taqueria"), tx("t3", "2026-09-10", "Diner")]),
    lastMonthToDateCents: 0,
    coverageStart: "2026-08-01",
    currency: "USD",
    connectionCount: 1,
    transactionCount: 3,
    lastSyncedAt: null,
  };

  beforeEach(() => route({ "GET /spending": () => json(200, SPENDING) }));

  it("opens the period's transaction list and marks and focuses the linked row", async () => {
    at("/spending?tx=t2");
    render(<SpendingView transactionId="t2" />);

    const list = await screen.findByTestId("spending-transactions-last-month");
    const rows = within(list).getAllByTestId("spending-transaction-row");
    expect(rows[0]).toHaveAttribute("data-linked", "true");
    expect(rows[0]).toHaveTextContent("Taqueria");
    expect(rows[0]).toHaveFocus();
    expect(rows[1]).not.toHaveAttribute("data-linked");
    expect(screen.getByTestId("spending-transactions-toggle-last-month")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("spending-transactions-toggle-this-month")).toHaveAttribute("aria-expanded", "false");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(replaced()).toHaveBeenCalledWith("/spending", { scroll: false });
  });

  it("marks the row inside an open category too, without moving focus there", async () => {
    const user = userEvent.setup();
    render(<SpendingView transactionId="t1" />);
    const panel = await screen.findByTestId("spending-period-this-month");
    await user.click(within(panel).getByTestId("spending-category-toggle"));
    expect(within(panel).getByTestId("spending-category-transaction-row")).toHaveAttribute("data-linked", "true");
  });

  it("says so when the transaction isn't in either period", async () => {
    render(<SpendingView transactionId="old" />);
    expect(await screen.findByTestId("link-target-missing")).toHaveTextContent("isn't in last month or this month's spending");
    expect(screen.getByTestId("spending-transactions-toggle-this-month")).toHaveAttribute("aria-expanded", "false");
    expect(linked()).toHaveLength(0);
  });
});

const ACCOUNT = {
  institutionName: "Demo Bank",
  currency: "USD",
  balanceCents: 1000,
  availableBalanceCents: null,
  balanceDate: "2026-10-24",
  statementClosingDay: null,
  paymentDueDay: null,
  aprBasisPoints: null,
  minimumPaymentRule: null,
  minimumPaymentCents: null,
} as const;
const INSTITUTION: InstitutionDTO = {
  id: "conn1",
  name: "Demo Bank",
  connectedAt: "2026-10-01T10:00:00.000Z",
  lastSyncedAt: null,
  accounts: [
    { ...ACCOUNT, id: "conn1:a1", name: "Checking", kind: "BANK" },
    { ...ACCOUNT, id: "conn1:a2", name: "Card", kind: "CREDIT" },
  ],
};

describe("Account transactions (?account=&tx=)", () => {
  const page = (offset: number, count: number, hasMore: boolean) => {
    const transactions: BankTransactionDTO[] = Array.from({ length: count }, (_, i) => ({
      id: `tx${offset + i}`,
      accountId: "conn1:a1",
      date: "2026-10-01",
      amountCents: -100 - i,
      description: `Purchase ${offset + i}`,
      pending: false,
    }));
    return () => json(200, { transactions, hasMore });
  };
  const qs = (account: string, offset: number) => `GET /institutions/conn1/transactions?accountId=${encodeURIComponent(account)}&offset=${offset}`;

  it("loads pages until the linked row is shown, then marks and focuses it", async () => {
    route({
      "GET /institutions": () => json(200, [INSTITUTION]),
      [qs("conn1:a2", 0)]: page(0, 50, true),
      [qs("conn1:a2", 50)]: page(50, 50, true),
      [qs("conn1:a2", 100)]: page(100, 50, true),
    });
    at("/institutions/conn1?account=conn1%3Aa2&tx=tx72");
    render(<TransactionHistory institutionId="conn1" initialAccountId="conn1:a2" transactionId="tx72" />);

    const row = await screen.findByTestId("transaction-row-tx72");
    await waitFor(() => expect(row).toHaveFocus());
    expect(row).toHaveAttribute("data-linked", "true");
    expect(linked()).toHaveLength(1);
    // It stops at the page that holds the row.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(qs("conn1:a2", 100).replace("GET ", "/api"));
    expect(replaced()).toHaveBeenCalledWith("/institutions/conn1?account=conn1%3Aa2", { scroll: false });
  });

  it("says so when the history ends without the row", async () => {
    route({
      "GET /institutions": () => json(200, [INSTITUTION]),
      [qs("conn1:a1", 0)]: page(0, 50, true),
      [qs("conn1:a1", 50)]: page(50, 3, false),
    });
    render(<TransactionHistory institutionId="conn1" initialAccountId="conn1:a1" transactionId="gone" />);
    expect(await screen.findByTestId("link-target-missing")).toHaveTextContent("isn't in this account's stored history");
    expect(screen.getAllByTestId(/^transaction-row-/)).toHaveLength(53);
  });

  it("marks nothing after switching to another account", async () => {
    const user = userEvent.setup();
    route({
      "GET /institutions": () => json(200, [INSTITUTION]),
      [qs("conn1:a1", 0)]: page(0, 2, false),
      [qs("conn1:a2", 0)]: page(0, 2, false),
    });
    render(<TransactionHistory institutionId="conn1" initialAccountId="conn1:a1" transactionId="tx1" />);
    expect(await screen.findByTestId("transaction-row-tx1")).toHaveAttribute("data-linked", "true");

    await user.selectOptions(screen.getByTestId("account-picker"), "conn1:a2");
    await screen.findByTestId("transaction-row-tx1");
    await waitFor(() => expect(linked()).toHaveLength(0));
    expect(screen.queryByTestId("link-target-missing")).not.toBeInTheDocument();
  });
});

describe("Institutions (?account=)", () => {
  const renderView = (accountId?: string) =>
    render(
      <ToastProvider>
        <InstitutionsView accountId={accountId} />
      </ToastProvider>,
    );

  it("marks and focuses the linked account's card", async () => {
    route({ "GET /institutions": () => json(200, [INSTITUTION]) });
    at("/institutions?account=conn1%3Aa2");
    renderView("conn1:a2");

    const row = await screen.findByTestId("account-row-conn1:a2");
    await waitFor(() => expect(row).toHaveAttribute("data-linked", "true"));
    expect(row.firstElementChild).toHaveFocus();
    expect(screen.getByTestId("account-row-conn1:a1")).not.toHaveAttribute("data-linked");
    expect(replaced()).toHaveBeenCalledWith("/institutions", { scroll: false });
  });

  it("says so when the account is gone", async () => {
    route({ "GET /institutions": () => json(200, [INSTITUTION]) });
    renderView("conn9:a1");
    expect(await screen.findByTestId("link-target-missing")).toHaveTextContent("That account wasn't found");
    expect(linked()).toHaveLength(0);
  });
});

describe("Savings goals (?goal=)", () => {
  const GOAL: SavingsGoalDTO = {
    id: "g1",
    name: "Vacation",
    targetAmountCents: 300000,
    targetDate: "2027-06-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const PROJECTION = { days: [], startingBalanceCents: 0, range: { from: "2026-10-01", to: "2027-10-01" }, currency: "USD" } as unknown as ProjectionResponse;

  it("marks the linked goal and opens it for editing; saving sends the changes", async () => {
    const user = userEvent.setup();
    let goals = [GOAL, { ...GOAL, id: "g2", name: "Car" }];
    const put = vi.fn((init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      goals = goals.map((g) => (g.id === "g1" ? { ...g, ...body } : g));
      return json(200, goals[0]);
    });
    route({
      "GET /savings-goals": () => json(200, goals),
      "GET /projection": () => json(200, PROJECTION),
      "PUT /savings-goals/g1": put,
    });
    at("/savings-goals?goal=g1");
    render(<SavingsGoalsView goalId="g1" />);

    const dialog = await screen.findByRole("dialog", { name: "Edit savings goal" });
    expect(within(dialog).getByTestId("savings-goal-edit-name")).toHaveValue("Vacation");
    expect(within(dialog).getByTestId("savings-goal-edit-amount")).toHaveValue("3000.00");
    expect(within(dialog).getByTestId("savings-goal-edit-date")).toHaveValue("2027-06-01");
    expect(await screen.findByTestId("savings-goal-card-g1")).toHaveAttribute("data-linked", "true");
    expect(screen.getByTestId("savings-goal-card-g2")).not.toHaveAttribute("data-linked");
    expect(replaced()).toHaveBeenCalledWith("/savings-goals", { scroll: false });

    const name = within(dialog).getByTestId("savings-goal-edit-name");
    await user.clear(name);
    await user.type(name, "Beach trip");
    await user.click(within(dialog).getByTestId("savings-goal-save"));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(String(put.mock.calls[0][0]?.body))).toEqual({ name: "Beach trip", targetAmountCents: 300000, targetDate: "2027-06-01" });
    expect(await screen.findByText("Beach trip")).toBeInTheDocument();
  });

  it("edits a goal from its Edit button and checks the amount", async () => {
    const user = userEvent.setup();
    route({ "GET /savings-goals": () => json(200, [GOAL]), "GET /projection": () => json(200, PROJECTION) });
    render(<SavingsGoalsView />);

    await user.click(await screen.findByRole("button", { name: "Edit Vacation" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit savings goal" });
    await user.clear(within(dialog).getByTestId("savings-goal-edit-amount"));
    await user.click(within(dialog).getByTestId("savings-goal-save"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a valid target amount.");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });

  it("says so when the goal is gone", async () => {
    route({ "GET /savings-goals": () => json(200, [GOAL]), "GET /projection": () => json(200, PROJECTION) });
    render(<SavingsGoalsView goalId="nope" />);
    expect(await screen.findByTestId("link-target-missing")).toHaveTextContent("That savings goal wasn't found");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
