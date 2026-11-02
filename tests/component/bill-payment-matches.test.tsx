import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillMatchesResponse, BillPaymentMatchDTO } from "@/contracts/api";
import { BillPaymentMatches } from "@/components/bills/bill-payment-matches";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

const { listBillMatches, setOccurrence } = vi.hoisted(() => ({ listBillMatches: vi.fn(), setOccurrence: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, listBillMatches, setOccurrence } };
});

const NETFLIX: BillPaymentMatchDTO = {
  billId: "b1",
  billName: "Netflix",
  dueDate: "2026-10-03",
  expectedCents: 1549,
  amountOverrideCents: null,
  note: null,
  transaction: { id: "t1", date: "2026-10-04", description: "NETFLIX.COM 1234", cents: 1549 },
};
const ELECTRIC: BillPaymentMatchDTO = {
  billId: "b2",
  billName: "Electric",
  dueDate: "2026-10-05",
  expectedCents: 14200,
  amountOverrideCents: 14200,
  note: "Heat wave",
  transaction: { id: "t2", date: "2026-10-06", description: "CITY ELECTRIC", cents: 13900 },
};

const response = (matches: BillPaymentMatchDTO[]): BillMatchesResponse => ({ matches, currency: "USD" });

beforeEach(() => {
  listBillMatches.mockReset();
  setOccurrence.mockReset();
  setOccurrence.mockResolvedValue({});
});

function renderMatches(onMarked = vi.fn()) {
  render(
    <ToastProvider>
      <BillPaymentMatches onMarked={onMarked} />
    </ToastProvider>,
  );
  return { onMarked, user: userEvent.setup() };
}

describe("BillPaymentMatches", () => {
  it("renders nothing when there are no matches", async () => {
    listBillMatches.mockResolvedValue(response([]));
    renderMatches();
    await waitFor(() => expect(listBillMatches).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("bill-matches")).toBeNull();
  });

  it("renders nothing when loading the matches fails", async () => {
    listBillMatches.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "Nope."));
    renderMatches();
    await waitFor(() => expect(listBillMatches).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("bill-matches")).toBeNull();
  });

  it("offers each match with the bank line and does nothing until confirmed", async () => {
    listBillMatches.mockResolvedValue(response([NETFLIX, ELECTRIC]));
    renderMatches();

    const card = await screen.findByTestId("bill-matches");
    const row = within(card).getByTestId("bill-match-b1:2026-10-03");
    expect(row).toHaveTextContent("Netflix");
    expect(row).toHaveTextContent("NETFLIX.COM 1234");
    expect(row).toHaveTextContent("$15.49");
    expect(row).not.toHaveTextContent("bill expects");
    expect(within(card).getByTestId("bill-match-b2:2026-10-05")).toHaveTextContent("bill expects $142.00");
    expect(card).toHaveTextContent(/projected balance doesn't change/i);
    expect(setOccurrence).not.toHaveBeenCalled();
  });

  it("marks paid through the occurrence endpoint, keeping the override and note, then refetches", async () => {
    listBillMatches.mockResolvedValueOnce(response([ELECTRIC, NETFLIX])).mockResolvedValue(response([NETFLIX]));
    const { user, onMarked } = renderMatches();

    await user.click(await screen.findByTestId("bill-match-paid-b2:2026-10-05"));

    await waitFor(() => expect(screen.queryByTestId("bill-match-b2:2026-10-05")).toBeNull());
    expect(setOccurrence).toHaveBeenCalledTimes(1);
    expect(setOccurrence).toHaveBeenCalledWith("b2", "2026-10-05", { status: "PAID", amountOverrideCents: 14200, note: "Heat wave" });
    expect(listBillMatches).toHaveBeenCalledTimes(2);
    expect(onMarked).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bill-match-b1:2026-10-03")).toBeInTheDocument();
  });

  it("sends no override for an occurrence that has none", async () => {
    listBillMatches.mockResolvedValueOnce(response([NETFLIX])).mockResolvedValue(response([]));
    const { user } = renderMatches();

    await user.click(await screen.findByTestId("bill-match-paid-b1:2026-10-03"));

    await waitFor(() => expect(setOccurrence).toHaveBeenCalledWith("b1", "2026-10-03", { status: "PAID", amountOverrideCents: null, note: null }));
    await waitFor(() => expect(screen.queryByTestId("bill-matches")).toBeNull());
  });

  it("'Not this one' hides the offer without calling the API", async () => {
    listBillMatches.mockResolvedValue(response([NETFLIX, ELECTRIC]));
    const { user, onMarked } = renderMatches();

    await user.click(await screen.findByTestId("bill-match-dismiss-b1:2026-10-03"));

    expect(screen.queryByTestId("bill-match-b1:2026-10-03")).toBeNull();
    expect(screen.getByTestId("bill-match-b2:2026-10-05")).toBeInTheDocument();
    expect(setOccurrence).not.toHaveBeenCalled();
    expect(onMarked).not.toHaveBeenCalled();
  });

  it("keeps the offer and shows the error when marking paid fails", async () => {
    listBillMatches.mockResolvedValue(response([NETFLIX]));
    setOccurrence.mockRejectedValue(new ApiError(400, "BAD_REQUEST", "2026-10-03 is not a scheduled due date for this bill."));
    const { user, onMarked } = renderMatches();

    await user.click(await screen.findByTestId("bill-match-paid-b1:2026-10-03"));

    expect(await screen.findByRole("alert")).toHaveTextContent("not a scheduled due date");
    expect(screen.getByTestId("bill-match-b1:2026-10-03")).toBeInTheDocument();
    expect(screen.getByTestId("bill-match-paid-b1:2026-10-03")).toBeEnabled();
    expect(onMarked).not.toHaveBeenCalled();
    expect(listBillMatches).toHaveBeenCalledTimes(1);
  });
});
