import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataExportDTO, SettingsDTO } from "@/contracts/api";
import { SettingsView } from "@/components/settings/settings-view";
import { ToastProvider } from "@/components/ui/toast";

const { getSettings, restoreBackup } = vi.hoisted(() => ({ getSettings: vi.fn(), restoreBackup: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, restoreBackup } };
});

const SETTINGS: SettingsDTO = {
  startingBalanceCents: 0, startingBalanceSource: "MANUAL", accountsBalanceCents: null, accountCount: 0,
  accountsBalanceDate: null, accountsStaleCount: 0, projectionStartDate: "2026-10-25", currency: "USD",
  forecastDays: 90, weekStartsOn: 0, defaultCalendarView: "month", desktopNotifications: true,
  balanceFloorCents: 0, updatedAt: null,
};
const backup: DataExportDTO = {
  format: "cashflow-planner-export", formatVersion: 1, appVersion: "1.0.0", exportedAt: "2026-10-24T15:00:00.000Z",
  settings: { ...SETTINGS, updatedAt: null },
  incomes: [{ id: "paycheck", name: "Paycheck", amountCents: 120000, frequency: "BIWEEKLY", anchorDate: "2026-10-30", endDate: null, active: true, notes: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  bills: [{ id: "rent", name: "Rent", amountCents: 90000, frequency: "MONTHLY", anchorDate: "2026-10-01", endDate: null, category: "Housing", notes: null, active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
  billOccurrences: [], institutions: [],
};

beforeEach(() => {
  toast.dismiss();
  getSettings.mockReset().mockResolvedValue(SETTINGS);
  restoreBackup.mockReset().mockResolvedValue({ ok: true });
});

const renderView = () => render(<ToastProvider><SettingsView appVersion="1.0.0" /></ToastProvider>);

describe("Settings → Restore from backup", () => {
  it("validates a file, confirms, restores parsed data, and shows success", async () => {
    const user = userEvent.setup();
    renderView();
    const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Choose backup file"), file);
    expect(await screen.findByTestId("confirm-restore-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Oct 24, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/1 paychecks, 1 bills/)).toBeInTheDocument();
    expect(screen.getByText(/Connected banks and their transactions are kept as they are now/)).toBeInTheDocument();
    expect(restoreBackup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Replace with backup" }));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith(backup));
    expect(await screen.findByText("Backup restored.")).toBeInTheDocument();
  });

  it("shows an error and does not request restore for an invalid file", async () => {
    const user = userEvent.setup();
    renderView();
    await user.upload(screen.getByLabelText("Choose backup file"), new File(["{}"], "bad.json", { type: "application/json" }));
    expect(await screen.findByText("That file isn't a CashFlow Planner backup.")).toBeInTheDocument();
    expect(restoreBackup).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-restore-dialog")).not.toBeInTheDocument();
  });

  it("accepts a v0.12-shaped backup and opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    renderView();
    const legacy = structuredClone(backup) as unknown as Record<string, unknown>;
    const legacySettings = { ...(legacy.settings as Record<string, unknown>) };
    delete legacySettings.accountsBalanceDate;
    delete legacySettings.accountsStaleCount;
    legacy.settings = legacySettings;
    const legacyAccount: Record<string, unknown> = { id: "account", providerAccountId: "provider", institutionName: "Bank", name: "Checking", kind: "BANK", currency: "USD", balanceCents: 1000, availableBalanceCents: null, balanceDate: "2026-10-25" };
    delete legacyAccount.kind;
    legacy.institutions = [{ id: "institution", name: "Bank", connectedAt: "2026-01-01T00:00:00.000Z", lastSyncedAt: null, accounts: [legacyAccount], transactions: [] }];
    const file = new File([JSON.stringify(legacy)], "backup-v012.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Choose backup file"), file);
    expect(await screen.findByTestId("confirm-restore-dialog")).toBeInTheDocument();
    expect(screen.queryByText("That file isn't a CashFlow Planner backup.")).not.toBeInTheDocument();
    expect(restoreBackup).not.toHaveBeenCalled();
  });
});
