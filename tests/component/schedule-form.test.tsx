import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleFormDialog } from "@/components/forms/schedule-form-dialog";
import { Dialog } from "@/components/ui/dialog";
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
    expect(screen.queryByTestId("toast-error")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["12.999", "abc", "-5", "0"])("rejects amount %j client-side", async (amount) => {
    const { user } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", amount);
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("bill-amount-error")).toBeInTheDocument();
    expect(screen.queryByTestId("toast-error")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("toast-error")).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).amountCents).toBe(1299);
  });

  it("keeps the toast for non-field request failures", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, {
        error: { code: "INTERNAL_ERROR", message: "The bill service is unavailable." },
      }),
    );
    const { user } = renderBillForm();
    await fill(user, "bill-name", "Rent");
    await fill(user, "bill-amount", "12.99");
    await user.click(screen.getByTestId("bill-form-submit"));
    expect(await screen.findByTestId("toast-error")).toHaveTextContent("The bill service is unavailable.");
  });

  it.each([
    ["bill", "bill-opener"],
    ["income", "income-opener"],
  ] as const)("restores focus to the %s opener after Escape", async (kind, openerTestId) => {
    function ControlledScheduleDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid={openerTestId} onClick={() => setOpen(true)}>
            Open
          </button>
          <ScheduleFormDialog kind={kind} open={open} onClose={() => setOpen(false)} />
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ControlledScheduleDialog />
      </ToastProvider>,
    );

    const opener = screen.getByTestId(openerTestId);
    await user.click(opener);
    await screen.findByTestId(`${kind}-form-dialog`);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByTestId(`${kind}-form-dialog`)).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it("keeps an explicit original opener when a controlled dialog is replaced while open", async () => {
    function ChainedDialog() {
      const [open, setOpen] = useState(false);
      const opener = useRef<HTMLButtonElement>(null);
      const [step, setStep] = useState<"loading" | "form">("loading");

      return (
        <>
          <button ref={opener} type="button" data-testid="chained-opener" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            step === "loading" ? (
              <Dialog restoreFocusTarget={() => opener.current} open onClose={() => setOpen(false)} title="Loading">
                <button type="button" data-testid="chained-next" onClick={() => setStep("form")}>
                  Continue
                </button>
              </Dialog>
            ) : (
              <ScheduleFormDialog restoreFocusTarget={() => opener.current} kind="bill" open onClose={() => setOpen(false)} />
            )
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ChainedDialog />
      </ToastProvider>,
    );

    const opener = screen.getByTestId("chained-opener");
    await user.click(opener);
    await user.click(screen.getByTestId("chained-next"));
    await screen.findByTestId("bill-form-dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByTestId("bill-form-dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });
});
