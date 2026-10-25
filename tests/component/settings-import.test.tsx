import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsDTO } from "@/contracts/api";
import { SettingsView } from "@/components/settings/settings-view";
import { ToastProvider } from "@/components/ui/toast";

const { getSettings, restoreBackup } = vi.hoisted(() => ({ getSettings: vi.fn(), restoreBackup: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, restoreBackup } };
});

const SETTINGS: SettingsDTO = {
  startingBalanceCents: 0, startingBalanceSource: "MANUAL", accountsBalanceCents: null, accountCount: 0,
  accountsBalanceDate: null, accountsStaleCount: 0, projectionStartDate: "2026-10-24", currency: "USD",
  forecastDays: 90, weekStartsOn: 0, defaultCalendarView: "month", updatedAt: null,
};
const renderView = () => render(<ToastProvider><SettingsView appVersion="9.9.9" /></ToastProvider>);
async function chooseBackup() {
  const file = new File([""], "household-backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue('{"format":"cashflow-planner-export"}') });
  await userEvent.upload(screen.getByTestId("settings-import-input"), file);
}

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(SETTINGS);
  restoreBackup.mockReset().mockResolvedValue({ ok: true });
});

describe("Settings → Restore from backup", () => {
  it("reads a selected file, confirms, then passes its exact text to the API", async () => {
    renderView();
    await userEvent.click(screen.getByTestId("settings-import"));
    await chooseBackup();
    expect(screen.getByTestId("settings-import-input")).toHaveValue("");
    const dialog = await screen.findByTestId("confirm-restore-dialog");
    expect(dialog).toHaveTextContent("household-backup.json");
    expect(dialog).toHaveTextContent("Connected banks are kept and not restored");
    await userEvent.click(screen.getByTestId("confirm-submit"));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('{"format":"cashflow-planner-export"}'));
    expect(await screen.findByText("Backup restored.")).toBeInTheDocument();
  });

  it("does not call the API when restore is canceled", async () => {
    renderView();
    await userEvent.click(screen.getByTestId("settings-import"));
    await chooseBackup();
    await userEvent.click(screen.getByTestId("confirm-cancel"));
    expect(restoreBackup).not.toHaveBeenCalled();
  });
});
