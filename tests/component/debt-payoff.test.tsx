import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccountDTO, InstitutionDTO } from "@/contracts/api";
import { DebtPayoffView } from "@/components/debt/debt-payoff-view";
import { ToastProvider } from "@/components/ui/toast";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const card = (id: string, name: string, balanceCents: number, aprBasisPoints: number | null): BankAccountDTO => ({
  id,
  name,
  institutionName: "Demo Bank",
  kind: "CREDIT",
  currency: "USD",
  balanceCents,
  availableBalanceCents: null,
  balanceDate: "2026-10-23",
  statementClosingDay: null,
  paymentDueDay: null,
  aprBasisPoints,
  minimumPaymentRule: null,
});

const institution = (accounts: BankAccountDTO[]): InstitutionDTO => ({
  id: "conn1",
  name: "Demo Bank",
  connectedAt: "2026-10-01T10:00:00.000Z",
  lastSyncedAt: null,
  accounts,
});

const WITH_APR = card("conn1:a1", "Visa", -300000, 1999);
const NO_APR = card("conn1:a2", "Store Card", -100000, null);

/** Routes fetch by "METHOD path"; each handler may be a function so a test can change the answer between calls. */
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
      <DebtPayoffView />
    </ToastProvider>,
  );

describe("DebtPayoffView APR", () => {
  it("shows balance, APR and the assumed minimum for every card", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR, NO_APR])]) });
    renderView();

    const visa = await screen.findByTestId("debt-card-row-conn1:a1");
    expect(within(visa).getByText("$3,000.00")).toBeInTheDocument();
    expect(within(visa).getByLabelText("APR % for Visa")).toHaveValue("19.99");
    // 2% of $3,000 = $60.00
    expect(within(visa).getByText("$60.00")).toBeInTheDocument();

    const store = screen.getByTestId("debt-card-row-conn1:a2");
    expect(within(store).getByText("$1,000.00")).toBeInTheDocument();
    // 2% of $1,000 is $20.00, so the $25.00 floor applies
    expect(within(store).getByText("$25.00")).toBeInTheDocument();
  });

  it("uses a plain text input with a decimal keypad and no number spinner", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR])]) });
    renderView();

    const input = await screen.findByLabelText("APR % for Visa");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("flags a card without an APR and warns on every result until it is filled in", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR, NO_APR])]) });
    renderView();

    expect(await screen.findByTestId("debt-apr-needed-conn1:a2")).toHaveTextContent("APR needed");
    expect(screen.queryByTestId("debt-apr-needed-conn1:a1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("APR % for Store Card")).toHaveValue("");

    const warning = screen.getByTestId("debt-apr-warning");
    expect(warning).toHaveTextContent("1 card has no APR");
    expect(warning).toHaveTextContent("Store Card");
    expect(screen.getByTestId("debt-apr-caveat-snowball")).toBeInTheDocument();
    expect(screen.getByTestId("debt-apr-caveat-avalanche")).toBeInTheDocument();
    expect(screen.getByTestId("debt-apr-caveat-comparison")).toBeInTheDocument();
  });

  it("shows no warning or flag when every card has an APR", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR])]) });
    renderView();

    await screen.findByTestId("debt-card-row-conn1:a1");
    expect(screen.queryByTestId("debt-apr-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("debt-apr-caveat-snowball")).not.toBeInTheDocument();
    expect(screen.queryByText("APR needed")).not.toBeInTheDocument();
  });

  it("does not flag a paid-off card with no APR, since the plan skips it", async () => {
    const paidOff = card("conn1:a3", "Old Card", 0, null);
    route({ "GET /institutions": () => json(200, [institution([WITH_APR, paidOff])]) });
    renderView();

    await screen.findByTestId("debt-card-row-conn1:a3");
    expect(screen.queryByTestId("debt-apr-warning")).not.toBeInTheDocument();
  });

  it("saves an edited APR as basis points through the account endpoint, then reloads and clears the warning", async () => {
    let stored: BankAccountDTO = NO_APR;
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(url).replace(/^\/api/, "");
      if (method === "GET" && path === "/institutions") return json(200, [institution([WITH_APR, stored])]);
      if (method === "PATCH" && path === "/institutions/conn1/accounts/conn1%3Aa2") {
        const body = JSON.parse(String(init?.body));
        patches.push(body);
        stored = { ...stored, aprBasisPoints: body.aprBasisPoints };
        return json(200, stored);
      }
      throw new Error(`unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByLabelText("APR % for Store Card");
    const save = screen.getByTestId("debt-apr-save-conn1:a2");
    expect(save).toBeDisabled();

    await user.type(input, "24.5");
    await user.click(save);

    await waitFor(() => expect(patches).toEqual([{ aprBasisPoints: 2450 }]));
    // The list was fetched again, so the card is no longer flagged and the warning is gone.
    await waitFor(() => expect(screen.queryByTestId("debt-apr-warning")).not.toBeInTheDocument());
    expect(screen.queryByTestId("debt-apr-needed-conn1:a2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("APR % for Store Card")).toHaveValue("24.5");
    const listCalls = fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET");
    expect(listCalls).toHaveLength(2);
  });

  it("rejects a malformed APR without calling the endpoint", async () => {
    route({ "GET /institutions": () => json(200, [institution([NO_APR])]) });
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("APR % for Store Card"), "abc");
    await user.click(screen.getByTestId("debt-apr-save-conn1:a2"));

    expect(await screen.findByTestId("debt-apr-error-conn1:a2")).toHaveTextContent("Enter a rate like 19.99");
    expect(screen.getByLabelText("APR % for Store Card")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the APR when the field is emptied", async () => {
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return json(200, [institution([WITH_APR])]);
      patches.push(JSON.parse(String(init?.body)));
      return json(200, { ...WITH_APR, aprBasisPoints: null });
    });
    const user = userEvent.setup();
    renderView();

    await user.clear(await screen.findByLabelText("APR % for Visa"));
    await user.click(screen.getByTestId("debt-apr-save-conn1:a1"));

    await waitFor(() => expect(patches).toEqual([{ aprBasisPoints: null }]));
  });
});
