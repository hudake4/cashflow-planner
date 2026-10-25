import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsView } from "@/components/settings/settings-view";
import { ToastProvider } from "@/components/ui/toast";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    startingBalanceCents: 100000, projectionStartDate: "2026-10-24", forecastDays: 90,
    weekStartsOn: 0, currency: "USD", defaultCalendarView: "month", desktopNotifications: true,
  }), { status: 200, headers: { "content-type": "application/json" } })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["load-demo-button", "Escape"], ["load-demo-button", "Cancel"],
  ["clear-data-button", "Escape"], ["clear-data-button", "Cancel"],
])("Settings %s restores focus after %s without changing data", async (testId, close) => {
  render(<ToastProvider><SettingsView appVersion="test" /></ToastProvider>);
  const user = userEvent.setup();
  const opener = screen.getByTestId(testId);
  await user.click(opener);
  await screen.findByRole("alertdialog");
  if (close === "Escape") await user.keyboard("{Escape}");
  else await user.click(screen.getByTestId("confirm-cancel"));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/settings")).toBe(true);
});
