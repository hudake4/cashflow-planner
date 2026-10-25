import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsDTO } from "@/contracts/api";
import { SettingsView } from "@/components/settings/settings-view";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

const { getSettings, saveSettings, downloadBackup } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  downloadBackup: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, saveSettings, downloadBackup } };
});

const SETTINGS: SettingsDTO = {
  startingBalanceCents: 0,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: null,
  accountCount: 0,
  projectionStartDate: "2026-10-24",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  updatedAt: null,
};

const createObjectURL = vi.fn(() => "blob:backup");
const revokeObjectURL = vi.fn();
let clicked: { href: string; download: string }[];

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(SETTINGS);
  saveSettings.mockReset().mockResolvedValue(SETTINGS);
  downloadBackup.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  // jsdom has no object URLs; this file's environment is discarded after it runs.
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderView = () =>
  render(
    <ToastProvider>
      <SettingsView appVersion="9.9.9" />
    </ToastProvider>,
  );

describe("Settings → Download backup", () => {
  it("downloads the file with the server's name, without asking for confirmation", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    downloadBackup.mockResolvedValue({ blob, filename: "cashflow-planner-backup-2026-10-24.json" });
    renderView();

    expect(screen.getByText(/Bank credentials are never included/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("settings-export"));

    await waitFor(() => expect(clicked).toEqual([{ href: "blob:backup", download: "cashflow-planner-backup-2026-10-24.json" }]));
    expect(downloadBackup).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Backup downloaded.")).toBeInTheDocument();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup"));
  });

  it("shows the server's error and downloads nothing when the export fails", async () => {
    downloadBackup.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again."));
    renderView();

    await userEvent.click(screen.getByTestId("settings-export"));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(clicked).toEqual([]);
    expect(screen.getByTestId("settings-export")).toBeEnabled();
  });
});

describe("Settings → Desktop notifications", () => {
  it("is on by default and is saved as off when switched off", async () => {
    renderView();

    const toggle = await screen.findByTestId("settings-desktop-notifications");
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    await userEvent.click(screen.getByTestId("settings-save"));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ desktopNotifications: false }));
  });

  it("shows a saved off setting as off", async () => {
    getSettings.mockResolvedValue({ ...SETTINGS, desktopNotifications: false });
    renderView();

    expect(await screen.findByTestId("settings-desktop-notifications")).not.toBeChecked();
  });
});