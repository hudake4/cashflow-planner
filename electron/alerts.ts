/**
 * Which alerts still need a desktop notification. Pure (no Electron), so it is unit-tested.
 *
 * The server (GET /api/alerts) lists every alert that is true right now, each with a stable
 * key. The app remembers the keys it already showed, so an alert is shown once per event and
 * not on every check. A key is forgotten after the date it expires on.
 */
import fs from "node:fs";

/** The fields of the server's AlertDTO that this file uses (electron/ cannot import from src/). */
export interface Alert {
  key: string;
  title: string;
  body: string;
  expiresOn: string;
}

/** Key of an alert already shown -> the date after which the key can be forgotten. */
export type NotifiedState = Record<string, string>;

export function selectNewAlerts(
  alerts: readonly Alert[],
  notified: NotifiedState,
  today: string
): { fresh: Alert[]; state: NotifiedState } {
  const state: NotifiedState = {};
  for (const [key, expiresOn] of Object.entries(notified)) {
    if (expiresOn >= today) state[key] = expiresOn;
  }
  const fresh = alerts.filter((a) => !(a.key in state));
  // Duplicate keys in one response are shown once.
  const seen = new Set<string>();
  const unique = fresh.filter((a) => !seen.has(a.key) && seen.add(a.key));
  for (const a of unique) state[a.key] = a.expiresOn;
  return { fresh: unique, state };
}

/** The fields of GET /api/alerts that this file uses. */
export interface AlertsResponse {
  today: string;
  enabled: boolean;
  alerts: readonly Alert[];
}

/**
 * What one check should do with the server's answer. With the "Desktop notifications"
 * setting off nothing is shown and nothing is remembered, so turning it back on shows
 * whatever is still relevant then.
 */
export function planCheck(
  response: AlertsResponse,
  notified: NotifiedState
): { fresh: Alert[]; state: NotifiedState | null } {
  if (!response.enabled) return { fresh: [], state: null };
  return selectNewAlerts(response.alerts, notified, response.today);
}

/** Reads the state file. A missing or unreadable file is an empty state (worst case: one repeat). */
export function loadNotified(file: string): NotifiedState {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as NotifiedState;
  } catch {
    return {};
  }
}

export function saveNotified(file: string, state: NotifiedState): void {
  fs.writeFileSync(file, JSON.stringify(state), "utf8");
}
