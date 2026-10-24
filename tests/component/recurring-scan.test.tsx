import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringScanResponse, RecurringSuggestionDTO } from "@/contracts/api";
import { RecurringScanButton } from "@/components/recurring/recurring-scan";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

const { scanRecurring, createBill, createIncome } = vi.hoisted(() => ({
  scanRecurring: vi.fn(),
  createBill: vi.fn(),
  createIncome: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, scanRecurring, createBill, createIncome } };
});

beforeEach(() => {
  scanRecurring.mockReset();
  createBill.mockReset();
  createIncome.mockReset();
  createBill.mockResolvedValue({});
  createIncome.mockResolvedValue({});
});

const BILL: RecurringSuggestionDTO = {
  key: "BILL:netflix",
  kind: "BILL",
  name: "Netflix",
  amountCents: 1599,
  frequency: "MONTHLY",
  nextDate: "2026-11-05",
  occurrences: 2,
  seenDates: ["2026-09-05", "2026-10-05"],
  amountVaries: false,
};

const INCOME: RecurringSuggestionDTO = {
  key: "INCOME:acme",
  kind: "INCOME",
  name: "Acme Payroll",
  amountCents: 250000,
  frequency: "BIWEEKLY",
  nextDate: "2026-10-30",
  occurrences: 3,
  seenDates: ["2026-10-02", "2026-10-16", "2026-10-30"],
  amountVaries: false,
};

const RENT: RecurringSuggestionDTO = { ...BILL, key: "BILL:rent", name: "Rent", amountCents: 120000, nextDate: "2026-11-01" };

const scanResponse = (suggestions: RecurringSuggestionDTO[], over: Partial<RecurringScanResponse> = {}): RecurringScanResponse => ({
  suggestions,
  currency: "USD",
  connectionCount: 1,
  transactionCount: 40,
  lastSyncedAt: "2026-10-24T12:00:00.000Z",
  ...over,
});

function renderButton(onAdded = vi.fn()) {
  render(
    <ToastProvider>
      <RecurringScanButton onAdded={onAdded} />
    </ToastProvider>,
  );
  return { onAdded, user: userEvent.setup() };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("scan-recurring-button"));
  return screen.findByTestId("recurring-dialog");
}

describe("RecurringScanButton", () => {
  it("opens the dialog on the first suggestion with its position and a bill action", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, INCOME]));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    expect(scanRecurring).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText("Netflix")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("1 of 2");
    expect(within(dialog).getByTestId("recurring-add")).toHaveTextContent("Add as bill");
    expect(within(dialog).getByTestId("recurring-skip")).toBeInTheDocument();
  });

  it("offers 'Add as income' for an income suggestion", async () => {
    scanRecurring.mockResolvedValue(scanResponse([INCOME]));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    expect(within(dialog).getByText("Acme Payroll")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("1 of 1");
    expect(within(dialog).getByTestId("recurring-add")).toHaveTextContent("Add as income");
  });

  it("adds a bill with exactly the scanned values, notifies the parent, and advances", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, INCOME]));
    const { user, onAdded } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-add"));

    await waitFor(() => expect(within(dialog).getByText("Acme Payroll")).toBeInTheDocument());
    expect(createBill).toHaveBeenCalledTimes(1);
    expect(createBill).toHaveBeenCalledWith({
      name: "Netflix",
      amountCents: 1599,
      frequency: "MONTHLY",
      anchorDate: "2026-11-05",
      endDate: null,
      notes: "Found in your bank history.",
      active: true,
      category: null,
    });
    expect(createIncome).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent("2 of 2");
    expect(within(dialog).getByTestId("recurring-add")).toHaveTextContent("Add as income");
  });

  it("adds income without a category field", async () => {
    scanRecurring.mockResolvedValue(scanResponse([INCOME]));
    const { user, onAdded } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-add"));

    await waitFor(() => expect(createIncome).toHaveBeenCalledTimes(1));
    const input = createIncome.mock.calls[0][0];
    expect(input).toEqual({
      name: "Acme Payroll",
      amountCents: 250000,
      frequency: "BIWEEKLY",
      anchorDate: "2026-10-30",
      endDate: null,
      notes: "Found in your bank history.",
      active: true,
    });
    expect("category" in input).toBe(false);
    expect(createBill).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("recurring-done")).toBeInTheDocument();
  });

  it("skips to the next suggestion without calling any create API or onAdded", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, INCOME]));
    const { user, onAdded } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-skip"));

    expect(await within(dialog).findByText("Acme Payroll")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("2 of 2");
    expect(createBill).not.toHaveBeenCalled();
    expect(createIncome).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows the summary with the number added after the last suggestion, and closes", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, RENT, INCOME]));
    const { user, onAdded } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-add")); // Netflix: added
    await within(dialog).findByText("Rent");
    await user.click(within(dialog).getByTestId("recurring-skip")); // Rent: skipped
    await within(dialog).findByText("Acme Payroll");
    await user.click(within(dialog).getByTestId("recurring-add")); // Acme: added

    const done = await within(dialog).findByTestId("recurring-done");
    expect(done).toHaveTextContent("Added 2");
    expect(onAdded).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByTestId("recurring-suggestion")).toBeNull();

    await user.click(within(dialog).getByTestId("recurring-close"));
    await waitFor(() => expect(screen.queryByTestId("recurring-dialog")).toBeNull());
  });

  it("says no changes were made when everything is skipped", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL]));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-skip"));

    expect(await within(dialog).findByTestId("recurring-done")).toHaveTextContent(/no changes made/i);
  });

  it("points to Institutions when no bank is connected", async () => {
    scanRecurring.mockResolvedValue(scanResponse([], { connectionCount: 0, transactionCount: 0, lastSyncedAt: null }));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    const noBank = within(dialog).getByTestId("recurring-no-bank");
    expect(within(noBank).getByRole("link")).toHaveAttribute("href", "/institutions");
    expect(within(dialog).queryByTestId("recurring-none")).toBeNull();
    expect(within(dialog).queryByTestId("recurring-done")).toBeNull();
  });

  it("says nothing new was found when connected but there are no suggestions", async () => {
    scanRecurring.mockResolvedValue(scanResponse([]));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    expect(within(dialog).getByTestId("recurring-none")).toHaveTextContent(/nothing new found/i);
    expect(within(dialog).queryByTestId("recurring-no-bank")).toBeNull();
    expect(within(dialog).queryByTestId("recurring-done")).toBeNull();
  });

  it("keeps the same suggestion and shows an error when adding fails", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, INCOME]));
    createBill.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "Could not save that bill."));
    const { user, onAdded } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-add"));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not save that bill.");
    expect(createBill).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText("Netflix")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("1 of 2");
    expect(within(dialog).queryByText("Acme Payroll")).toBeNull();
    expect(onAdded).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId("recurring-add")).toBeEnabled();
  });

  it("prefixes server validation errors and clears the error on skip", async () => {
    scanRecurring.mockResolvedValue(scanResponse([BILL, INCOME]));
    createBill.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Name is too long."));
    const { user } = renderButton();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByTestId("recurring-add"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't add this one: Name is too long.");

    await user.click(within(dialog).getByTestId("recurring-skip"));
    expect(await within(dialog).findByText("Acme Payroll")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("does not open the dialog when the scan fails", async () => {
    scanRecurring.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "Scan failed."));
    const { user } = renderButton();

    await user.click(screen.getByTestId("scan-recurring-button"));

    await waitFor(() => expect(scanRecurring).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("scan-recurring-button")).toBeEnabled());
    expect(screen.queryByTestId("recurring-dialog")).toBeNull();
    expect(createBill).not.toHaveBeenCalled();
    expect(createIncome).not.toHaveBeenCalled();
  });
});
