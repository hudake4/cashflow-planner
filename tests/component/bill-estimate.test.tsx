import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillEstimateDTO, LedgerEvent } from "@/contracts/api";
import { EventDetailDialog } from "@/components/calendar/event-detail-dialog";
import { ToastProvider } from "@/components/ui/toast";

const { getBillEstimate, setOccurrence } = vi.hoisted(() => ({ getBillEstimate: vi.fn(), setOccurrence: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getBillEstimate, setOccurrence } };
});

beforeEach(() => {
  getBillEstimate.mockReset();
  setOccurrence.mockReset();
});

const EVENT: LedgerEvent = {
  id: "BILL:b1:2026-11-15",
  date: "2026-11-15",
  kind: "BILL",
  sourceId: "b1",
  name: "City Electric",
  category: null,
  frequency: "MONTHLY",
  amountCents: 9000,
  signedAmountCents: -9000,
  status: "UPCOMING",
  included: true,
  amountOverridden: false,
  sequence: 0,
  balanceAfterCents: 100000,
};

const renderDialog = (event: LedgerEvent = EVENT) =>
  render(
    <ToastProvider>
      <EventDetailDialog event={event} currency="USD" onClose={() => {}} onChanged={() => {}} onEditSource={() => {}} />
    </ToastProvider>,
  );

const SUGGESTED: BillEstimateDTO = {
  estimate: { amountCents: 12345, method: "ROLLING", periodCount: 2, firstDate: "2026-08-12", lastDate: "2026-09-12" },
  reason: null,
  currency: "USD",
};

describe("bill estimate in the occurrence dialog", () => {
  it("shows a suggestion and puts it in the amount field only when asked, without saving", async () => {
    getBillEstimate.mockResolvedValue(SUGGESTED);
    const user = userEvent.setup();
    renderDialog();
    const input = screen.getByTestId("occurrence-override");
    expect(getBillEstimate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("occurrence-estimate-suggest"));
    expect(getBillEstimate).toHaveBeenCalledWith("b1", "2026-11-15");
    const result = await screen.findByTestId("occurrence-estimate-result");
    expect(result).toHaveTextContent("$123.45");
    expect(result).toHaveTextContent("last 2 complete months");
    expect(input).toHaveValue("");

    await user.click(screen.getByTestId("occurrence-estimate-use"));
    expect(input).toHaveValue("123.45");
    expect(setOccurrence).not.toHaveBeenCalled();
  });

  it("explains why there is no suggestion", async () => {
    getBillEstimate.mockResolvedValue({ estimate: null, reason: "TOO_FEW_PERIODS", currency: "USD" } satisfies BillEstimateDTO);
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("occurrence-estimate-suggest"));
    expect(await screen.findByTestId("occurrence-estimate-none")).toHaveTextContent("Not enough bank history");
    expect(screen.queryByTestId("occurrence-estimate-use")).toBeNull();
  });

  it("is not offered for bills it cannot estimate", async () => {
    renderDialog({ ...EVENT, frequency: "YEARLY" });
    await waitFor(() => expect(screen.getByTestId("occurrence-override")).toBeInTheDocument());
    expect(screen.queryByTestId("occurrence-estimate-suggest")).toBeNull();
  });
});
