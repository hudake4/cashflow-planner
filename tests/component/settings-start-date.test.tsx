import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsDTO } from "@/contracts/api";
import { SettingsView } from "@/components/settings/settings-view";
import { ToastProvider } from "@/components/ui/toast";

const { getSettings, saveSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, getSettings, saveSettings } };
});

const SETTINGS: SettingsDTO = {
  startingBalanceCents: 100000,
  startingBalanceSource: "MANUAL",
  accountsBalanceCents: 525000,
  accountCount: 2,
  accountsBalanceDate: "2026-10-20",
  accountsStaleCount: 0,
  projectionStartDate: "2026-10-01",
  currency: "USD",
  forecastDays: 90,
  weekStartsOn: 0,
  defaultCalendarView: "month",
  desktopNotifications: true,
  updatedAt: "2026-10-24T12:00:00.000Z",
};

const renderView = async (settings: SettingsDTO) => {
  getSettings.mockResolvedValue(settings);
  render(
    <ToastProvider>
      <SettingsView appVersion="9.9.9" />
    </ToastProvider>,
  );
  await screen.findByTestId("settings-form");
};

beforeEach(() => {
  getSettings.mockReset();
  saveSettings.mockReset().mockResolvedValue(SETTINGS);
});

describe("Settings → projection start date", () => {
  it("MANUAL: the start date is an editable field with the typed value", async () => {
    await renderView(SETTINGS);

    expect(screen.getByTestId("settings-start-date")).toHaveValue("2026-10-01");
    expect(screen.getByTestId("settings-start-date")).toBeEnabled();
    expect(screen.queryByTestId("settings-start-date-derived")).not.toBeInTheDocument();
  });

  it("ACCOUNTS with bank accounts: shows the oldest balance date read-only and drops the 'set it to today' advice", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS" });

    const derived = screen.getByTestId("settings-start-date-derived");
    expect(derived).toHaveTextContent("Oct 20, 2026");
    expect(derived).toHaveTextContent("From your last bank refresh");
    expect(screen.queryByTestId("settings-start-date")).not.toBeInTheDocument();
    expect(screen.queryByText(/set the start date to today/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-accounts-balance")).toHaveTextContent("$5,250.00");
  });

  it("ACCOUNTS: says same-day events are still applied, so one that already posted may be counted twice", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS" });

    const derived = screen.getByTestId("settings-start-date-derived");
    expect(derived).toHaveTextContent(/dated on this date are still projected/i);
    expect(derived).toHaveTextContent(/may be counted twice on that day/i);
  });

  it("ACCOUNTS: no stale-account notice when every account is fresh", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS" });

    expect(screen.queryByTestId("stale-accounts-note")).not.toBeInTheDocument();
  });

  it("ACCOUNTS with a stale account: says its balance is still counted and links to Institutions", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS", accountsStaleCount: 1 });

    const note = screen.getByTestId("stale-accounts-note");
    expect(note).toHaveTextContent("1 account hasn't refreshed in over a week; its balance is still counted.");
    expect(note).toHaveTextContent("Relabel it as Other, or refresh its bank, on the Institutions page.");
    expect(within(note).getByRole("link", { name: "Institutions page" })).toHaveAttribute("href", "/institutions");
    expect(screen.getByTestId("settings-start-date-derived")).toContainElement(note);
  });

  it("ACCOUNTS with several stale accounts: uses the plural wording", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS", accountsStaleCount: 2 });

    const note = screen.getByTestId("stale-accounts-note");
    expect(note).toHaveTextContent("2 accounts haven't refreshed in over a week; their balances are still counted.");
    expect(note).toHaveTextContent("Relabel them as Other, or refresh their banks, on the Institutions page.");
  });

  it("MANUAL: the stale-account notice is not shown, because the typed date is used", async () => {
    await renderView({ ...SETTINGS, accountsStaleCount: 1 });

    expect(screen.queryByTestId("stale-accounts-note")).not.toBeInTheDocument();
  });

  it("ACCOUNTS without a bank account: the start date stays editable", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS", accountsBalanceCents: null, accountCount: 0, accountsBalanceDate: null });

    expect(screen.getByTestId("settings-start-date")).toHaveValue("2026-10-01");
    expect(screen.queryByTestId("settings-start-date-derived")).not.toBeInTheDocument();
  });

  it("switching the source swaps between the derived date and the typed one", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS" });

    await userEvent.selectOptions(screen.getByTestId("settings-balance-source"), "MANUAL");
    expect(screen.getByTestId("settings-start-date")).toHaveValue("2026-10-01");
    expect(screen.queryByTestId("settings-start-date-derived")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByTestId("settings-balance-source"), "ACCOUNTS");
    expect(screen.getByTestId("settings-start-date-derived")).toBeInTheDocument();
  });

  it("saving in ACCOUNTS mode sends the typed start date, never the derived one", async () => {
    await renderView({ ...SETTINGS, startingBalanceSource: "ACCOUNTS" });

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ startingBalanceSource: "ACCOUNTS", projectionStartDate: "2026-10-01", startingBalanceCents: 100000 }),
    );
  });
});
