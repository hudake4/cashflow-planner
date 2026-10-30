import { createElement, forwardRef, type AnchorHTMLAttributes } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse, SearchResultDTO } from "@/contracts/api";
import { CommandPalette } from "@/components/command-palette";
import { ApiError } from "@/lib/api-client";

const { search } = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, search } };
});

// A plain anchor: the router is not mounted in jsdom. Clicks are recorded by the test instead of navigating.
vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function Link(props, ref) {
    return createElement("a", { ...props, ref });
  }),
}));

const BILL: SearchResultDTO = {
  id: "b1",
  kind: "BILL",
  title: "Rent",
  subtitle: "Housing · Monthly",
  amountCents: 120000,
  currency: "USD",
  href: "/bills?edit=b1",
};
const INCOME: SearchResultDTO = {
  id: "i1",
  kind: "INCOME",
  title: "Rent rebate",
  subtitle: "Every 2 weeks",
  amountCents: 25000,
  currency: "USD",
  href: "/income?edit=i1",
};
const TRANSACTION: SearchResultDTO = {
  id: "acct:t1",
  kind: "TRANSACTION",
  title: "RENT PAYMENT",
  subtitle: "Checking · Demo Bank · 2026-10-20",
  amountCents: -4520,
  currency: "USD",
  href: "/spending",
};
const GOAL: SearchResultDTO = {
  id: "g1",
  kind: "GOAL",
  title: "Rent buffer",
  subtitle: "Target date 2027-01-01",
  amountCents: 300000,
  currency: "USD",
  href: "/savings-goals",
};
const ACCOUNT: SearchResultDTO = {
  id: "acct",
  kind: "ACCOUNT",
  title: "Rent Savings",
  subtitle: "Demo Bank · Bank",
  amountCents: null,
  currency: null,
  href: "/institutions/c1?account=acct",
};

const reply = (results: SearchResultDTO[], query = "rent"): SearchResponse => ({ query, results });

let navigated: string[] = [];
const recordNavigation = (event: MouseEvent) => {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  event.preventDefault();
  navigated.push(anchor.getAttribute("href") ?? "");
};

beforeEach(() => {
  search.mockReset();
  search.mockResolvedValue(reply([]));
  navigated = [];
  document.addEventListener("click", recordNavigation);
});

afterEach(() => {
  document.removeEventListener("click", recordNavigation);
});

async function openPalette() {
  render(<CommandPalette />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  return screen.findByTestId("command-palette-input");
}

const optionLabels = () => screen.queryAllByTestId("command-palette-option").map((o) => o.textContent ?? "");
const groupHeadings = () => screen.queryAllByTestId("command-palette-group").map((g) => g.textContent);

describe("CommandPalette", () => {
  it("opens with Ctrl+K and lists pages and quick add without searching", async () => {
    await openPalette();
    expect(groupHeadings()).toEqual(["Pages", "Quick add"]);
    expect(screen.getByRole("option", { name: /Spend Analyzer/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Add bill/ })).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("opens with Cmd+K too", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(await screen.findByTestId("command-palette-dialog")).toBeInTheDocument();
  });

  it("searches once after typing stops, with the trimmed text and a per-group limit", async () => {
    search.mockResolvedValue(reply([BILL]));
    const user = userEvent.setup();
    const input = await openPalette();
    await user.type(input, " rent ");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith("rent", 8);
  });

  it("shows results in labelled groups with formatted amounts", async () => {
    search.mockResolvedValue(reply([BILL, INCOME, TRANSACTION, GOAL, ACCOUNT]));
    const user = userEvent.setup();
    await user.type(await openPalette(), "rent");

    await screen.findByRole("option", { name: /Rent buffer/ });
    expect(groupHeadings()).toEqual(["Bills", "Income", "Transactions", "Savings Goals", "Accounts"]);

    const bill = screen.getByRole("option", { name: /Housing · Monthly/ });
    expect(within(bill).getByText("−$1,200.00")).toBeInTheDocument();
    expect(bill).toHaveAttribute("href", "/bills?edit=b1");
    expect(within(screen.getByRole("option", { name: /Rent rebate/ })).getByText("+$250.00")).toBeInTheDocument();
    expect(within(screen.getByRole("option", { name: /RENT PAYMENT/ })).getByText("−$45.20")).toBeInTheDocument();
    expect(within(screen.getByRole("option", { name: /Rent buffer/ })).getByText("$3,000.00")).toBeInTheDocument();
    const account = screen.getByRole("option", { name: /Rent Savings/ });
    expect(within(account).getByText("Demo Bank · Bank")).toBeInTheDocument();
    expect(account).toHaveAttribute("href", "/institutions/c1?account=acct");
  });

  it("keeps matching pages and shortcuts first, ahead of the server results", async () => {
    search.mockResolvedValue(reply([BILL], "bill"));
    const user = userEvent.setup();
    await user.type(await openPalette(), "bill");
    await screen.findByRole("option", { name: /Housing/ });
    expect(groupHeadings()).toEqual(["Pages", "Quick add", "Bills"]);
    expect(optionLabels()[0]).toMatch(/^Bills/);
  });

  it("says Searching… while the request is open, never 'No results'", async () => {
    let finish: (value: SearchResponse) => void = () => {};
    search.mockReturnValue(new Promise<SearchResponse>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await user.type(await openPalette(), "zzz");

    expect(await screen.findByTestId("command-palette-loading")).toHaveTextContent("Searching…");
    expect(screen.queryByTestId("command-palette-empty")).not.toBeInTheDocument();

    await act(async () => finish(reply([], "zzz")));
    await waitFor(() => expect(screen.queryByTestId("command-palette-loading")).not.toBeInTheDocument());
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    await user.type(await openPalette(), "zzz");
    expect(await screen.findByTestId("command-palette-empty")).toHaveTextContent("No results");
    expect(screen.queryByTestId("command-palette-option")).not.toBeInTheDocument();
  });

  it("says search is unavailable on an error but keeps pages usable", async () => {
    search.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "boom"));
    const user = userEvent.setup();
    await user.type(await openPalette(), "bill");
    expect(await screen.findByTestId("command-palette-error")).toHaveTextContent("Search is unavailable");
    expect(screen.getByRole("option", { name: /^Bills/ })).toBeInTheDocument();
    expect(screen.queryByTestId("command-palette-empty")).not.toBeInTheDocument();
  });

  it("shows the error message alone when nothing matches locally either", async () => {
    search.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "offline"));
    const user = userEvent.setup();
    await user.type(await openPalette(), "zzz");
    expect(await screen.findByTestId("command-palette-error")).toBeInTheDocument();
    expect(screen.queryByTestId("command-palette-empty")).not.toBeInTheDocument();
  });

  it("ignores a slow answer to an earlier query", async () => {
    const pending = new Map<string, (value: SearchResponse) => void>();
    search.mockImplementation((q: string) => new Promise<SearchResponse>((resolve) => pending.set(q, resolve)));
    const user = userEvent.setup();
    const input = await openPalette();

    await user.type(input, "ren");
    await waitFor(() => expect(search).toHaveBeenCalledWith("ren", 8));
    await user.type(input, "t");
    await waitFor(() => expect(search).toHaveBeenCalledWith("rent", 8));

    await act(async () => pending.get("rent")!(reply([BILL], "rent")));
    await act(async () => pending.get("ren")!(reply([{ ...BILL, id: "b2", title: "Stale result" }], "ren")));

    expect(screen.getByRole("option", { name: /Housing/ })).toBeInTheDocument();
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
  });

  it("clears the previous results as soon as the query changes", async () => {
    search.mockResolvedValueOnce(reply([BILL]));
    search.mockReturnValueOnce(new Promise<SearchResponse>(() => {}));
    const user = userEvent.setup();
    const input = await openPalette();
    await user.type(input, "rent");
    await screen.findByRole("option", { name: /Housing/ });

    await user.type(input, "x");
    await waitFor(() => expect(screen.queryByRole("option", { name: /Housing/ })).not.toBeInTheDocument());
  });

  it("limits the input to the length the endpoint accepts", async () => {
    expect(await openPalette()).toHaveAttribute("maxlength", "100");
  });

  it("moves with the arrow keys and opens the active result with Enter", async () => {
    search.mockResolvedValue(reply([BILL, INCOME]));
    const user = userEvent.setup();
    await user.type(await openPalette(), "rent");
    await screen.findByRole("option", { name: /Rent rebate/ });

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(navigated).toEqual(["/income?edit=i1"]);
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("points aria-activedescendant at the active option", async () => {
    search.mockResolvedValue(reply([BILL]));
    const user = userEvent.setup();
    const input = await openPalette();
    await user.type(input, "rent");
    const option = await screen.findByRole("option", { name: /Housing/ });
    await user.keyboard("{End}");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
  });

  it("opens a page from the empty query with Enter", async () => {
    const user = userEvent.setup();
    await openPalette();
    await user.keyboard("{Enter}");
    expect(navigated).toEqual(["/"]);
  });

  it("closes with Escape and gives focus back to the opener", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Opener</button>
        <CommandPalette />
      </>,
    );
    screen.getByText("Opener").focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByTestId("command-palette-input");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument());
    expect(screen.getByText("Opener")).toHaveFocus();
  });

  it("starts empty each time it opens", async () => {
    const user = userEvent.setup();
    const input = await openPalette();
    await user.type(input, "rent");
    await user.keyboard("{Escape}");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByTestId("command-palette-input")).toHaveValue("");
    expect(groupHeadings()).toEqual(["Pages", "Quick add"]);
  });
});
