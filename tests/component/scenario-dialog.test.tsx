import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScenarioDialog } from "@/components/scenario/scenario-dialog";
import type { BillDTO, IncomeDTO } from "@/contracts/api";

const bills: BillDTO[] = [
  { id: "b1", name: "Rent", amountCents: 20000, frequency: "MONTHLY", anchorDate: "2025-01-10", endDate: null, category: null, notes: null, active: true, createdAt: "x", updatedAt: "x" },
];
const incomes: IncomeDTO[] = [
  { id: "i1", name: "Pay", amountCents: 50000, frequency: "BIWEEKLY", anchorDate: "2025-01-03", endDate: null, active: true, notes: null, createdAt: "x", updatedAt: "x" },
];

function renderDialog(overrides: { bills?: BillDTO[]; incomes?: IncomeDTO[] } = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <ScenarioDialog open onClose={onClose} onApply={onApply} bills={overrides.bills ?? bills} incomes={overrides.incomes ?? incomes} />,
  );
  return { onApply, onClose, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, testId: string, value: string) {
  const el = screen.getByTestId(testId);
  await user.clear(el);
  if (value) await user.type(el, value);
}

describe("ScenarioDialog", () => {
  it("shows required-field errors and does not apply when amount and date are empty", async () => {
    const { user, onApply, onClose } = renderDialog();
    await user.click(screen.getByTestId("scenario-apply"));

    expect(await screen.findByTestId("scenario-amount-error")).toHaveTextContent(/amount is required/i);
    expect(screen.getByTestId("scenario-date-error")).toHaveTextContent(/date is required/i);
    expect(screen.getByTestId("scenario-amount")).toHaveAttribute("aria-invalid", "true");
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["12.999", "abc", "-5", "0"])("rejects amount %j client-side", async (amount) => {
    const { user, onApply } = renderDialog();
    await fill(user, "scenario-date", "2025-01-15");
    await fill(user, "scenario-amount", amount);
    await user.click(screen.getByTestId("scenario-apply"));

    expect(await screen.findByTestId("scenario-amount-error")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("parses '1,234.56' as 123456 cents and applies the scenario", async () => {
    const { user, onApply } = renderDialog();
    await fill(user, "scenario-name", "Extra");
    await fill(user, "scenario-amount", "1,234.56");
    await fill(user, "scenario-date", "2025-01-15");
    await user.click(screen.getByTestId("scenario-apply"));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith({ kind: "ADD_BILL", name: "Extra", amountCents: 123456, date: "2025-01-15" });
  });

  it("resets the target to the first income when switching to Remove income", async () => {
    const { user, onApply } = renderDialog();
    await user.selectOptions(screen.getByTestId("scenario-kind"), "REMOVE_INCOME");

    expect((screen.getByTestId("scenario-target") as HTMLSelectElement).value).toBe("i1");
    await user.click(screen.getByTestId("scenario-apply"));
    expect(onApply).toHaveBeenCalledWith({ kind: "REMOVE_INCOME", id: "i1" });
  });

  it("resets the target to the first bill when switching to Remove bill", async () => {
    const { user, onApply } = renderDialog();
    await user.selectOptions(screen.getByTestId("scenario-kind"), "REMOVE_BILL");

    expect((screen.getByTestId("scenario-target") as HTMLSelectElement).value).toBe("b1");
    await user.click(screen.getByTestId("scenario-apply"));
    expect(onApply).toHaveBeenCalledWith({ kind: "REMOVE_BILL", id: "b1" });
  });
});
