import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { NOTIFICATION_LIMIT, NOTIFICATION_STORAGE_KEY } from "@/lib/notification-history";

function Pusher() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast("Bill “Rent” added.")}>Push success</button>
      <button onClick={() => toast("The bill service is unavailable.", "error")}>Push error</button>
    </>
  );
}

function renderBell() {
  render(
    <ToastProvider>
      <Pusher />
      <NotificationBell />
    </ToastProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => localStorage.clear());

describe("NotificationBell", () => {
  it("explains that nothing has been shown yet", async () => {
    const user = renderBell();
    await user.click(screen.getByTestId("notification-bell"));
    const dialog = await screen.findByTestId("notification-history");

    expect(within(dialog).getByTestId("notification-empty")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("notification-clear")).not.toBeInTheDocument();
  });

  it("lists earlier notifications newest first after their toasts are gone", async () => {
    const user = renderBell();
    await user.click(screen.getByText("Push success"));
    await user.click(screen.getByText("Push error"));
    await user.click(screen.getByTestId("notification-bell"));
    const dialog = await screen.findByTestId("notification-history");

    const items = within(dialog).getAllByTestId("notification-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("The bill service is unavailable.");
    expect(items[0]).toHaveTextContent("Error:");
    expect(items[1]).toHaveTextContent("Bill “Rent” added.");
  });

  it("restores the history from storage and clears it", async () => {
    localStorage.setItem(
      NOTIFICATION_STORAGE_KEY,
      JSON.stringify([{ id: "a", message: "Settings saved.", tone: "success", at: Date.UTC(2026, 10, 6, 15, 0) }]),
    );
    const user = renderBell();
    await user.click(screen.getByTestId("notification-bell"));
    const dialog = await screen.findByTestId("notification-history");
    expect(within(dialog).getByTestId("notification-item")).toHaveTextContent("Settings saved.");

    await user.click(within(dialog).getByTestId("notification-clear"));

    expect(within(dialog).getByTestId("notification-empty")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) ?? "null")).toEqual([]);
  });

  it("keeps the stored history when a new notification arrives and caps its length", async () => {
    const stored = Array.from({ length: NOTIFICATION_LIMIT }, (_, i) => ({ id: `s${i}`, message: `Old ${i}`, tone: "success", at: i }));
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(stored));
    const user = renderBell();
    await user.click(screen.getByText("Push success"));

    const saved = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) ?? "[]") as { message: string }[];
    expect(saved).toHaveLength(NOTIFICATION_LIMIT);
    expect(saved[0].message).toBe("Bill “Rent” added.");
    expect(saved[1].message).toBe("Old 0");
  });

  it("ignores corrupt stored data", async () => {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, "{not json");
    const user = renderBell();
    await user.click(screen.getByTestId("notification-bell"));
    expect(await screen.findByTestId("notification-empty")).toBeInTheDocument();
  });
});
