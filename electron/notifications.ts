/**
 * Native desktop notifications for low balance and bills due soon (CONVENTIONS section 14).
 * The app's own local server decides what is worth saying (GET /api/alerts, 127.0.0.1 only);
 * this file only asks it now and then and shows what is new. Nothing leaves the machine.
 */
import path from "node:path";
import { app, Notification } from "electron";
import { loadNotified, planCheck, saveNotified, type AlertsResponse } from "./alerts";

const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 30 * 60_000;

export function startAlertNotifications(baseUrl: string, onClick: () => void): () => void {
  if (!Notification.isSupported()) return () => {};
  const stateFile = path.join(app.getPath("userData"), "notified-alerts.json");

  async function check(): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/api/alerts`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return;
      // The setting is read on every check, so the switch in Settings takes effect without a restart.
      const { fresh, state } = planCheck((await res.json()) as AlertsResponse, loadNotified(stateFile));
      // Remember before showing, so a failure while showing cannot turn into a repeat on every check.
      if (state) saveNotified(stateFile, state);
      for (const alert of fresh) {
        const notification = new Notification({ title: alert.title, body: alert.body });
        notification.on("click", onClick);
        notification.show();
      }
    } catch (err) {
      // Notifications are a convenience: a failed check is retried at the next interval.
      console.warn("Alert check failed:", err instanceof Error ? err.message : err);
    }
  }

  const first = setTimeout(() => void check(), FIRST_CHECK_MS);
  const timer = setInterval(() => void check(), CHECK_EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
