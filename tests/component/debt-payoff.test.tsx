import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccountDTO, InstitutionDTO, SettingsDTO } from "@/contracts/api";
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
  minimumPaymentCents: null,
});

const institution = (accounts: BankAccountDTO[]): InstitutionDTO => ({
  id: "conn1",
  name: "Demo Bank",
  connectedAt: "2026-10-01T10:00:00.000Z",
  lastSyncedAt: null,
  accounts,
});

const SETTINGS = { debtMonthlyPaymentCents: 50000 } as SettingsDTO;
const settingsResponse = () => json(200, SETTINGS);

const WITH_APR = card("conn1:a1", "Visa", -300000, 1999);
const NO_APR = card("conn1:a2", "Store Card", -100000, null);

/** Routes fetch by "METHOD path"; each handler may be a function so a test can change the answer between calls. */
function route(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}`;
    const handler = handlers[key] ?? (key === "GET /settings" ? settingsResponse : undefined);
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
  it("shows balance, APR and the estimated minimum for every card", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR, NO_APR])]) });
    renderView();

    const visa = await screen.findByTestId("debt-card-row-conn1:a1");
    expect(within(visa).getByText("$3,000.00")).toBeInTheDocument();
    expect(within(visa).getByLabelText("APR % for Visa")).toHaveValue("19.99");
    // 2% of $3,000 = $60.00
    expect(within(visa).getByLabelText("Minimum payment $ for Visa")).toHaveValue("");
    expect(within(visa).getByLabelText("Minimum payment $ for Visa")).toHaveAttribute("placeholder", "60.00");
    expect(within(visa).getByTestId("debt-min-estimated-conn1:a1")).toBeInTheDocument();

    const store = screen.getByTestId("debt-card-row-conn1:a2");
    expect(within(store).getByText("$1,000.00")).toBeInTheDocument();
    // 2% of $1,000 is $20.00, so the $25.00 floor applies
    expect(within(store).getByLabelText("Minimum payment $ for Store Card")).toHaveAttribute("placeholder", "25.00");
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
    expect(warning).toHaveTextContent("1 account has no APR");
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
      if (method === "GET" && path === "/settings") return settingsResponse();
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
    const listCalls = fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? "GET") === "GET" && String(url).endsWith("/institutions"));
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
    expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET")).toHaveLength(0);
  });

  it("clears the APR when the field is emptied", async () => {
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return String(url).endsWith("/settings") ? settingsResponse() : json(200, [institution([WITH_APR])]);
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

const LOAN: BankAccountDTO = { ...card("conn1:a9", "Car Loan", 1200000, 549), kind: "LOAN", minimumPaymentCents: 35000 };

describe("DebtPayoffView minimum payment", () => {
  it("shows a stored minimum as the field value, with no 'Estimated' hint", async () => {
    route({ "GET /institutions": () => json(200, [institution([LOAN])]) });
    renderView();

    const row = await screen.findByTestId("debt-card-row-conn1:a9");
    expect(within(row).getByLabelText("Minimum payment $ for Car Loan")).toHaveValue("350.00");
    expect(within(row).queryByTestId("debt-min-estimated-conn1:a9")).not.toBeInTheDocument();
  });

  it("saves an edited minimum in cents, then reloads", async () => {
    let stored: BankAccountDTO = WITH_APR;
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(url).replace(/^\/api/, "");
      if (method === "GET" && path === "/settings") return settingsResponse();
      if (method === "GET" && path === "/institutions") return json(200, [institution([stored])]);
      if (method === "PATCH" && path === "/institutions/conn1/accounts/conn1%3Aa1") {
        const body = JSON.parse(String(init?.body));
        patches.push(body);
        stored = { ...stored, minimumPaymentCents: body.minimumPaymentCents };
        return json(200, stored);
      }
      throw new Error(`unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Minimum payment $ for Visa"), "$125.5");
    await user.click(screen.getByTestId("debt-min-save-conn1:a1"));

    await waitFor(() => expect(patches).toEqual([{ minimumPaymentCents: 12550 }]));
    await waitFor(() => expect(screen.queryByTestId("debt-min-estimated-conn1:a1")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Minimum payment $ for Visa")).toHaveValue("125.50");
  });

  it("clears the stored minimum when the field is emptied, so the estimate applies again", async () => {
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return String(url).endsWith("/settings") ? settingsResponse() : json(200, [institution([LOAN])]);
      patches.push(JSON.parse(String(init?.body)));
      return json(200, { ...LOAN, minimumPaymentCents: null });
    });
    const user = userEvent.setup();
    renderView();

    await user.clear(await screen.findByLabelText("Minimum payment $ for Car Loan"));
    await user.click(screen.getByTestId("debt-min-save-conn1:a9"));

    await waitFor(() => expect(patches).toEqual([{ minimumPaymentCents: null }]));
  });

  it.each(["abc", "0", "-5", "12.345"])("rejects %j without calling the endpoint", async (text) => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR])]) });
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Minimum payment $ for Visa"), text);
    await user.click(screen.getByTestId("debt-min-save-conn1:a1"));

    expect(await screen.findByTestId("debt-min-error-conn1:a1")).toHaveTextContent("Enter an amount like 35.00");
    expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET")).toHaveLength(0);
  });

});

describe("DebtPayoffView loans", () => {
  it("lists loans next to cards with the same inputs, labels them, and leaves other accounts out", async () => {
    const checking: BankAccountDTO = { ...card("conn1:a5", "Checking", 250000, null), kind: "BANK" };
    route({ "GET /institutions": () => json(200, [institution([WITH_APR, LOAN, checking])]) });
    renderView();

    const loan = await screen.findByTestId("debt-card-row-conn1:a9");
    expect(within(loan).getByTestId("debt-loan-conn1:a9")).toHaveTextContent("Loan");
    expect(within(loan).getByText("$12,000.00")).toBeInTheDocument();
    expect(within(loan).getByLabelText("APR % for Car Loan")).toHaveValue("5.49");
    expect(within(loan).getByLabelText("Minimum payment $ for Car Loan")).toBeInTheDocument();
    expect(screen.queryByTestId("debt-loan-conn1:a1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("debt-card-row-conn1:a5")).not.toBeInTheDocument();
  });

  it("saves a loan's APR through the same endpoint", async () => {
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return String(url).endsWith("/settings") ? settingsResponse() : json(200, [institution([LOAN])]);
      expect(String(url)).toBe("/api/institutions/conn1/accounts/conn1%3Aa9");
      patches.push(JSON.parse(String(init?.body)));
      return json(200, LOAN);
    });
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByLabelText("APR % for Car Loan");
    await user.clear(input);
    await user.type(input, "6.25");
    await user.click(screen.getByTestId("debt-apr-save-conn1:a9"));

    await waitFor(() => expect(patches).toEqual([{ aprBasisPoints: 625 }]));
  });

  it("includes the loan in both plans", async () => {
    route({ "GET /institutions": () => json(200, [institution([LOAN])]) });
    renderView();

    expect(await screen.findByTestId("debt-months-snowball")).toBeInTheDocument();
    // $12,000 at 5.49% on $500 a month takes years, so a plan exists for both strategies.
    expect(Number(screen.getByTestId("debt-months-avalanche").textContent)).toBeGreaterThan(24);
  });

  it("shows the empty state when there is no card or loan", async () => {
    const checking: BankAccountDTO = { ...card("conn1:a5", "Checking", 250000, null), kind: "BANK" };
    route({ "GET /institutions": () => json(200, [institution([checking])]) });
    renderView();

    expect(await screen.findByTestId("debt-empty-no-cards")).toHaveTextContent("No credit cards or loans found");
  });
});

describe("DebtPayoffView monthly payment", () => {
  it("starts from the saved payment instead of a fixed $500", async () => {
    route({
      "GET /institutions": () => json(200, [institution([WITH_APR])]),
      "GET /settings": () => json(200, { ...SETTINGS, debtMonthlyPaymentCents: 123456 }),
    });
    renderView();

    expect(await screen.findByTestId("debt-monthly-payment")).toHaveValue("1234.56");
  });

  it("saves a changed payment through the settings endpoint, and it survives a reload", async () => {
    let stored = 50000;
    const patches: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(url).replace(/^\/api/, "");
      if (method === "GET" && path === "/settings") return json(200, { ...SETTINGS, debtMonthlyPaymentCents: stored });
      if (method === "GET" && path === "/institutions") return json(200, [institution([WITH_APR])]);
      if (method === "PATCH" && path === "/settings") {
        const body = JSON.parse(String(init?.body));
        patches.push(body);
        stored = body.debtMonthlyPaymentCents;
        return json(200, { ...SETTINGS, debtMonthlyPaymentCents: stored });
      }
      throw new Error(`unexpected request: ${method} ${path}`);
    });
    const user = userEvent.setup();
    const first = renderView();

    const input = await screen.findByTestId("debt-monthly-payment");
    expect(screen.getByTestId("debt-monthly-payment-save")).toBeDisabled();
    await user.clear(input);
    await user.type(input, "800");
    await user.click(screen.getByTestId("debt-monthly-payment-save"));

    await waitFor(() => expect(patches).toEqual([{ debtMonthlyPaymentCents: 80000 }]));
    await waitFor(() => expect(screen.getByTestId("debt-monthly-payment-save")).toBeDisabled());
    expect(screen.getByTestId("debt-monthly-payment")).toHaveValue("800.00");

    // A fresh page load reads the saved value back.
    first.unmount();
    renderView();
    expect(await screen.findByTestId("debt-monthly-payment")).toHaveValue("800.00");
  });

  it("plans with what is typed before it is saved, and rejects a malformed amount on save", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR])]) });
    const user = userEvent.setup();
    renderView();

    const months = async () => Number((await screen.findByTestId("debt-months-snowball")).textContent);
    const atFiveHundred = await months();
    const input = screen.getByTestId("debt-monthly-payment");
    await user.clear(input);
    await user.type(input, "1500");
    expect(await months()).toBeLessThan(atFiveHundred);

    await user.clear(input);
    await user.type(input, "5x0");
    await user.click(screen.getByTestId("debt-monthly-payment-save"));
    expect(await screen.findByTestId("debt-monthly-payment-error")).toHaveTextContent("Enter an amount like 500.00");
    expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET")).toHaveLength(0);
  });

  it("falls back to $500.00 when the settings can't be loaded, and still shows the plans", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/settings")) return json(500, { error: { code: "INTERNAL", message: "boom" } });
      return json(200, [institution([WITH_APR])]);
    });
    renderView();

    expect(await screen.findByTestId("debt-monthly-payment")).toHaveValue("500.00");
    expect(screen.getByTestId("debt-months-snowball")).toBeInTheDocument();
  });
});

describe("DebtPayoffView results", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 28, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says when the debt will be gone, counting from today's month", async () => {
    // $1,000 at 0% on $500 a month: two months.
    const small = { ...card("conn1:s", "Small", 100000, 0), minimumPaymentCents: 50000 };
    route({ "GET /institutions": () => json(200, [institution([small])]) });
    renderView();

    expect(await screen.findByTestId("debt-free-snowball")).toHaveTextContent("Debt-free by December 2026");
    expect(screen.getByTestId("debt-free-avalanche")).toHaveTextContent("Debt-free by December 2026");
  });

  it("opens and closes a month-by-month schedule for each strategy", async () => {
    const small = { ...card("conn1:s", "Small", 100000, 0), minimumPaymentCents: 50000 };
    route({ "GET /institutions": () => json(200, [institution([small])]) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderView();

    const toggle = await screen.findByTestId("debt-schedule-toggle-snowball");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const schedule = screen.getByTestId("debt-schedule-snowball");
    const rows = within(schedule).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + two months
    expect(within(rows[1]).getByText("Nov 2026")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Dec 2026")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Paid off: Small/)).toBeInTheDocument();
    expect(within(rows[2]).getAllByText("$0.00").length).toBeGreaterThan(0);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows no debt-free date or schedule when the payment never pays the balance down", async () => {
    route({ "GET /institutions": () => json(200, [institution([WITH_APR])]), "GET /settings": () => json(200, { ...SETTINGS, debtMonthlyPaymentCents: 0 }) });
    renderView();

    expect(await screen.findByTestId("debt-warning-snowball")).toBeInTheDocument();
    expect(screen.queryByTestId("debt-free-snowball")).not.toBeInTheDocument();
    expect(screen.queryByTestId("debt-schedule-toggle-snowball")).not.toBeInTheDocument();
  });
});
