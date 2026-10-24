import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleFormDialog } from "@/components/forms/schedule-form-dialog";
import { ToastProvider } from "@/components/ui/toast";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderBillForm(onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <ToastProvider>
      <ScheduleFormDialog kind="bill" open onClose={onClose} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved, onClose, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, testId: string, value: string) {
  const el = screen.getByTestId(testId);
  await user.clear(el);
  if (value) await user.type(el, value);
}

describe("ScheduleFormDialog (bill)", () => {
  it("shows required-field errors and does not call the API", async () => {
    const { user } = renderBillForm();
    await fill(user, "bill-name", "");
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("bill-name-error")).toHaveTextContent(/name is required/i);
    expect(screen.getByTestId("bill-amount-error")).toHaveTextContent(/amount is required/i);
    expect(screen.getByTestId("bill-name")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["12.999", "abc", "-5", "0"])("rejects amount %j client-side", async (amount) => {
    const { user } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", amount);
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("bill-amount-error")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an end date before the first due date", async () => {
    const { user } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", "100");
    await fill(user, "bill-anchor-date", "2025-03-10");
    await fill(user, "bill-end-date", "2025-03-09");
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("bill-end-date-error")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses '1,234.56' as 123456 cents (string parsing, not floats) and posts it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        id: "b1",
        name: "Rent",
        amountCents: 123456,
        frequency: "MONTHLY",
        anchorDate: "2025-01-31",
        endDate: null,
        category: "Housing",
        notes: null,
        active: true,
        createdAt: "x",
        updatedAt: "x",
      }),
    );
    const { user, onSaved } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", "1,234.56");
    await fill(user, "bill-anchor-date", "2025-01-31");
    await fill(user, "bill-category", "Housing");
    await user.click(screen.getByTestId("bill-form-submit"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/bills");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Rent",
      amountCents: 123456,
      frequency: "MONTHLY",
      anchorDate: "2025-01-31",
      endDate: null,
      category: "Housing",
    });
  });

  it("shows server fieldErrors from a 400 VALIDATION_ERROR", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors: { name: ["Server says no"] } },
      }),
    );
    const { user, onSaved } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", "12.99");
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("bill-name-error")).toHaveTextContent("Server says no");
    expect(onSaved).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).amountCents).toBe(1299);
  });
});
