import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankTransactionDTO, InstitutionDTO } from "@/contracts/api";
import { InstitutionsView } from "@/components/institutions/institutions-view";
import { TransactionHistory } from "@/components/institutions/transaction-history";
import { ToastProvider } from "@/components/ui/toast";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const INSTITUTION: InstitutionDTO = {
  id: "conn1",
  name: "Demo Bank",
  connectedAt: "2026-10-01T10:00:00.000Z",
  lastSyncedAt: null,
  accounts: [
    {
      id: "conn1:a1",
      name: "Checking",
      institutionName: "Demo Bank",
      kind: "BANK",
      currency: "USD",
      balanceCents: 123456,
      availableBalanceCents: 100000,
      balanceDate: "2026-10-24",
      statementClosingDay: null,
      paymentDueDay: null,
      aprBasisPoints: null,
      minimumPaymentRule: null,
    },
    {
      id: "conn1:a2",
      name: "Card",
      institutionName: "Demo Bank",
      kind: "CREDIT",
      currency: "USD",
      balanceCents: -5000,
      availableBalanceCents: null,
      balanceDate: "2026-10-23",
      statementClosingDay: null,
      paymentDueDay: null,
      aprBasisPoints: null,
      minimumPaymentRule: null,
    },
  ],
};

/** Routes fetch calls by "METHOD path" so each test only declares what it needs. */
function route(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected request: ${key}`);
    return handler();
  });
}

const renderView = () =>
  render(
    <ToastProvider>
      <InstitutionsView />
    </ToastProvider>,
  );

describe("InstitutionsView", () => {
  it("prefills card dates from the stored days and saves selected days with APR basis points", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00"));
    const card = { ...INSTITUTION.accounts[1], statementClosingDay: 5, paymentDueDay: 2, aprBasisPoints: 1999 };
    route({
      "GET /institutions": () => json(200, [{ ...INSTITUTION, accounts: [INSTITUTION.accounts[0], card] }]),
      "PATCH /institutions/conn1/accounts/conn1%3Aa2": () => json(200, card),
    });
    const user = userEvent.setup();
    renderView();

    const closing = await screen.findByTestId("card-closing-conn1:a2");
    const due = screen.getByTestId("card-due-conn1:a2");
    const apr = screen.getByTestId("card-apr-conn1:a2");
    expect(closing).toHaveAttribute("type", "date");
    expect(closing).toHaveValue("2026-11-05");
    expect(due).toHaveAttribute("type", "date");
    expect(due).toHaveValue("2026-12-02");
    expect(apr).toHaveAttribute("type", "text");
    expect(apr).toHaveAttribute("inputmode", "decimal");

    fireEvent.change(closing, { target: { value: "2026-11-18" } });
    fireEvent.change(due, { target: { value: "2026-12-07" } });
    fireEvent.change(apr, { target: { value: "19.99" } });
    await user.click(screen.getByTestId("card-save-conn1:a2"));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patchCall![1].body)).toEqual({ statementClosingDay: 18, paymentDueDay: 7, aprBasisPoints: 1999 });
  });

  it("preserves stored closing and due days 29-31 when saving only APR", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00"));
    const card = { ...INSTITUTION.accounts[1], statementClosingDay: 31, paymentDueDay: 31, aprBasisPoints: null };
    route({
      "GET /institutions": () => json(200, [{ ...INSTITUTION, accounts: [INSTITUTION.accounts[0], card] }]),
      "PATCH /institutions/conn1/accounts/conn1%3Aa2": () => json(200, card),
    });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByTestId("card-closing-conn1:a2")).toHaveValue("2026-11-30");
    fireEvent.change(screen.getByTestId("card-apr-conn1:a2"), { target: { value: "19.99" } });
    await user.click(screen.getByTestId("card-save-conn1:a2"));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patchCall![1].body)).toEqual({ statementClosingDay: 31, paymentDueDay: 31, aprBasisPoints: 1999 });
  });

  it("rejects invalid APR text without sending a PATCH and clears the error on edit", async () => {
    route({ "GET /institutions": () => json(200, [INSTITUTION]) });
    const user = userEvent.setup();
    renderView();

    const apr = await screen.findByTestId("card-apr-conn1:a2");
    fireEvent.change(apr, { target: { value: "abc" } });
    await user.click(screen.getByTestId("card-save-conn1:a2"));
    expect(await screen.findByTestId("card-apr-conn1:a2-error")).toHaveTextContent("Enter a rate like 19.99");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);

    fireEvent.change(apr, { target: { value: "1.234" } });
    await user.click(screen.getByTestId("card-save-conn1:a2"));
    expect(screen.getByTestId("card-apr-conn1:a2-error")).toBeInTheDocument();
    fireEvent.change(apr, { target: { value: "19.99" } });
    expect(screen.queryByTestId("card-apr-conn1:a2-error")).toBeNull();
  });

  it("shows the empty state and opens the connect dialog, rejecting an empty token client-side", async () => {
    route({ "GET /institutions": () => json(200, []) });
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByTestId("institutions-empty")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Institutions" })).toBeInTheDocument();

    await user.click(screen.getAllByTestId("add-institution-button")[0]);
    const dialog = await screen.findByTestId("connect-dialog");
    expect(within(dialog).getByTestId("simplefin-link")).toHaveAttribute("href", "https://bridge.simplefin.org/simplefin/create");

    await user.click(within(dialog).getByTestId("connect-submit"));
    expect(await within(dialog).findByTestId("setup-token-error")).toHaveTextContent(/paste your simplefin setup token/i);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial list request
  });

  it("hides a zero Available on credit cards but keeps it on bank accounts", async () => {
    const accounts = [
      { ...INSTITUTION.accounts[0], id: "conn1:bank0", availableBalanceCents: 0 },
      { ...INSTITUTION.accounts[1], id: "conn1:card0", availableBalanceCents: 0 },
      { ...INSTITUTION.accounts[1], id: "conn1:card1", availableBalanceCents: 250000 },
    ];
    route({ "GET /institutions": () => json(200, [{ ...INSTITUTION, accounts }]) });
    renderView();

    expect(await screen.findByTestId("account-row-conn1:bank0")).toHaveTextContent("Available");
    expect(screen.getByTestId("account-row-conn1:card0")).not.toHaveTextContent("Available");
    expect(screen.getByTestId("account-row-conn1:card1")).toHaveTextContent("Available");
  });

  it("connects with a pasted token and shows SimpleFIN warnings as text", async () => {
    let connected = false;
    route({
      "GET /institutions": () => json(200, connected ? [INSTITUTION] : []),
      "POST /institutions": () => {
        connected = true;
        return json(201, { ...INSTITUTION, warnings: ["<img src=x> Please re-login"] });
      },
    });
    const user = userEvent.setup();
    renderView();
    await user.click((await screen.findAllByTestId("add-institution-button"))[0]);
    await user.type(await screen.findByTestId("setup-token"), "  TOKEN123  ");
    await user.click(screen.getByTestId("connect-submit"));

    expect(await screen.findByTestId("institution-card-conn1")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post![1].body)).toEqual({ setupToken: "TOKEN123" });
    const notice = await screen.findByTestId("institutions-notice");
    expect(notice).toHaveTextContent("<img src=x> Please re-login");
    expect(notice.querySelector("img")).toBeNull(); // rendered as text, not markup
  });

  it("shows a server error inside the dialog and keeps the token for correction", async () => {
    route({
      "GET /institutions": () => json(200, []),
      "POST /institutions": () => json(400, { error: { code: "BAD_REQUEST", message: "That setup token is invalid or has already been used." } }),
    });
    const user = userEvent.setup();
    renderView();
    await user.click((await screen.findAllByTestId("add-institution-button"))[0]);
    await user.type(await screen.findByTestId("setup-token"), "BADTOKEN");
    await user.click(screen.getByTestId("connect-submit"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent(/already been used/);
    expect(screen.getByTestId("setup-token")).toHaveValue("BADTOKEN");
  });

  it("renders accounts with balances, links to transactions, and refreshes on demand", async () => {
    const synced = { ...INSTITUTION, lastSyncedAt: "2026-10-24T12:00:00.000Z" };
    let didSync = false;
    route({
      "GET /institutions": () => json(200, [didSync ? synced : INSTITUTION]),
      "POST /institutions/conn1/sync": () => {
        didSync = true;
        return json(200, { ...synced, warnings: [] });
      },
    });
    const user = userEvent.setup();
    renderView();

    const card = await screen.findByTestId("institution-card-conn1");
    expect(within(card).getByText("Demo Bank")).toBeInTheDocument();
    expect(within(card).getByText(/not synced yet/i)).toBeInTheDocument();
    expect(within(card).getByText("$1,234.56")).toBeInTheDocument();
    expect(within(card).getByText("$1,000.00")).toBeInTheDocument(); // available balance
    expect(within(card).getByText(/negative balance/i)).toBeInTheDocument();
    expect(within(card).getByTestId("account-link-conn1:a1")).toHaveAttribute("href", "/institutions/conn1?account=conn1%3Aa1");

    await user.click(within(card).getByTestId("sync-institution-conn1"));
    await waitFor(() => expect(within(card).getByText(/last synced/i)).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/institutions/conn1/sync" && init?.method === "POST")).toBe(true);
  });

  it("labels an account through the select and reloads the list", async () => {
    let kind = "BANK";
    const accounts = () => INSTITUTION.accounts.map((a) => (a.id === "conn1:a1" ? { ...a, kind } : a));
    route({
      "GET /institutions": () => json(200, [{ ...INSTITUTION, accounts: accounts() }]),
      "PATCH /institutions/conn1/accounts/conn1%3Aa1": () => {
        kind = "LOAN";
        return json(200, accounts()[0]);
      },
    });
    const user = userEvent.setup();
    renderView();

    const select = await screen.findByTestId("account-kind-conn1:a1");
    expect(select).toHaveAccessibleName("Account type for Checking");
    expect(select).toHaveValue("BANK");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Bank account",
      "Credit card / line of credit",
      "Loan",
      "Other",
    ]);
    expect(screen.queryByTestId("account-excluded-conn1:a1")).toBeNull();

    await user.selectOptions(select, "LOAN");

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch![0]).toBe("/api/institutions/conn1/accounts/conn1%3Aa1");
    expect(JSON.parse(patch![1].body)).toEqual({ kind: "LOAN" });
    await waitFor(() => expect(screen.getByTestId("account-kind-conn1:a1")).toHaveValue("LOAN"));
    expect(screen.getByTestId("account-excluded-conn1:a1")).toHaveTextContent("Not counted in your starting balance");
    const getCalls = fetchMock.mock.calls.filter(([url, init]) => url === "/api/institutions" && (init?.method ?? "GET") === "GET");
    expect(getCalls.length).toBeGreaterThanOrEqual(2); // initial load + reload after the change
  });

  it("notes that non-bank accounts are not counted in the starting balance", async () => {
    route({ "GET /institutions": () => json(200, [INSTITUTION]) });
    renderView();

    await screen.findByTestId("institution-card-conn1");
    expect(screen.queryByTestId("account-excluded-conn1:a1")).toBeNull(); // bank account
    expect(screen.getByTestId("account-kind-conn1:a2")).toHaveValue("CREDIT");
    expect(screen.getByTestId("account-excluded-conn1:a2")).toHaveTextContent("Not counted in your starting balance");
  });

  it("explains that removing is local only before deleting", async () => {
    route({
      "GET /institutions": () => json(200, [INSTITUTION]),
      "DELETE /institutions/conn1": () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByTestId("remove-institution-conn1"));
    const dialog = await screen.findByTestId("confirm-remove-institution");
    expect(dialog).toHaveTextContent(/removed from this app only/i);
    expect(dialog).toHaveTextContent(/disable the token in your SimpleFIN/i);
    await user.click(within(dialog).getByTestId("confirm-submit"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/institutions/conn1" && init?.method === "DELETE")).toBe(true),
    );
  });
});

describe("TransactionHistory", () => {
  const txs = (from: number, to: number): BankTransactionDTO[] =>
    Array.from({ length: to - from }, (_, i) => ({
      id: `conn1:a1:t${from + i}`,
      accountId: "conn1:a1",
      date: "2026-10-20",
      description: `Purchase ${from + i}`,
      amountCents: (from + i) % 2 ? -1234 : 250000,
      pending: from + i === 1,
    }));

  it("shows signed amounts, a pending badge, and loads more with an offset", async () => {
    route({
      "GET /institutions": () => json(200, [INSTITUTION]),
      "GET /institutions/conn1/transactions?accountId=conn1%3Aa1&offset=0": () =>
        json(200, { transactions: txs(0, 3), hasMore: true }),
      "GET /institutions/conn1/transactions?accountId=conn1%3Aa1&offset=3": () =>
        json(200, { transactions: txs(3, 5), hasMore: false }),
    });
    const user = userEvent.setup();
    render(<TransactionHistory institutionId="conn1" initialAccountId="conn1:a1" />);

    const table = await screen.findByTestId("transactions-table");
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3
    const row0 = screen.getByTestId("transaction-row-conn1:a1:t0");
    expect(row0).toHaveTextContent("+$2,500.00");
    expect(row0).toHaveTextContent(/money in/i);
    const row1 = screen.getByTestId("transaction-row-conn1:a1:t1");
    expect(row1).toHaveTextContent("−$12.34");
    expect(row1).toHaveTextContent(/money out/i);
    expect(row1).toHaveTextContent("Pending");
    expect(screen.getByTestId("account-picker")).toBeInTheDocument(); // two accounts

    await user.click(screen.getByTestId("load-more"));
    await waitFor(() => expect(within(screen.getByTestId("transactions-table")).getAllByRole("row")).toHaveLength(6));
    expect(screen.queryByTestId("load-more")).toBeNull();
  });

  it("says so when the connection no longer exists", async () => {
    route({ "GET /institutions": () => json(200, []) });
    render(<TransactionHistory institutionId="gone" />);
    expect(await screen.findByTestId("institution-not-found")).toBeInTheDocument();
  });
});
