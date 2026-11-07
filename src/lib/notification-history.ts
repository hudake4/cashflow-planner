/**
 * Log of the toast notifications the app has shown. Like the theme, it is a display convenience
 * of this browser (not household data), so it lives in localStorage rather than the database.
 * Newest first, capped so it cannot grow without bound.
 */
export type NotificationTone = "success" | "error";

export interface NotificationEntry {
  id: string;
  message: string;
  tone: NotificationTone;
  /** Epoch milliseconds. */
  at: number;
}

export const NOTIFICATION_STORAGE_KEY = "cashflow-notifications";
export const NOTIFICATION_LIMIT = 50;

export function appendNotification(entries: NotificationEntry[], entry: NotificationEntry): NotificationEntry[] {
  return [entry, ...entries].slice(0, NOTIFICATION_LIMIT);
}

function isEntry(value: unknown): value is NotificationEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.message === "string" &&
    (e.tone === "success" || e.tone === "error") &&
    typeof e.at === "number" &&
    Number.isFinite(e.at)
  );
}

export function loadNotifications(): NotificationEntry[] {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, NOTIFICATION_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveNotifications(entries: NotificationEntry[]) {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable: the history still works for this page view.
  }
}
