/**
 * Teller client. The ONLY module that touches the Teller certificate, private key and
 * access tokens (docs/CONVENTIONS.md §9). It uses mutual TLS plus HTTP Basic auth with
 * the access token as the username and an empty password, through Node's built-in
 * `https`, so no extra packages are needed.
 *
 * Settings come from the environment (see .env.example). The sandbox environment does
 * not require a client certificate; development and production do.
 */
import fs from "node:fs";
import https from "node:https";
import { TELLER_ENVIRONMENTS, type InstitutionsConfigDTO, type TellerEnvironment } from "../contracts/api";
import { ApiError } from "./http";
import type { TellerAccount, TellerTransaction } from "./teller-mapping";

const API_HOST = "api.teller.io";
const REQUEST_TIMEOUT_MS = 20_000;

interface TellerSettings {
  applicationId: string;
  environment: TellerEnvironment;
  certPath: string | null;
  keyPath: string | null;
}

function readSettings(): TellerSettings | null {
  const applicationId = process.env.TELLER_APPLICATION_ID?.trim();
  const environment = (process.env.TELLER_ENVIRONMENT?.trim() || "sandbox") as TellerEnvironment;
  if (!applicationId || !TELLER_ENVIRONMENTS.includes(environment)) return null;
  const certPath = process.env.TELLER_CERT_PATH?.trim() || null;
  const keyPath = process.env.TELLER_KEY_PATH?.trim() || null;
  // Real banks need Teller's certificate; sandbox does not.
  if (environment !== "sandbox" && (!certPath || !keyPath)) return null;
  return { applicationId, environment, certPath, keyPath };
}

export function isConfigured(): boolean {
  return readSettings() !== null;
}

/** The public part of the settings for the browser (the Application ID is not a secret). */
export function getPublicConfig(): InstitutionsConfigDTO {
  const s = readSettings();
  return s
    ? { configured: true, applicationId: s.applicationId, environment: s.environment }
    : { configured: false, applicationId: null, environment: null };
}

let cachedAgent: { key: string; agent: https.Agent } | null = null;

function agentFor(s: TellerSettings): https.Agent | undefined {
  if (!s.certPath || !s.keyPath) return undefined;
  const key = `${s.certPath}|${s.keyPath}`;
  if (cachedAgent?.key === key) return cachedAgent.agent;
  try {
    const agent = new https.Agent({ cert: fs.readFileSync(s.certPath), key: fs.readFileSync(s.keyPath), keepAlive: true });
    cachedAgent = { key, agent };
    return agent;
  } catch (err) {
    console.error("[teller] could not read certificate or key", err);
    throw new ApiError(502, "UPSTREAM_ERROR", "The Teller certificate or private key could not be read. Check TELLER_CERT_PATH and TELLER_KEY_PATH.");
  }
}

interface RawResponse {
  status: number;
  body: string;
}

function rawRequest(method: string, path: string, token: string, s: TellerSettings): Promise<RawResponse> {
  const agent = agentFor(s);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: API_HOST,
        path,
        method,
        agent,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** Maps a failed Teller response to our error shape. Messages never include tokens. */
export function tellerError(status: number, body: string): ApiError {
  let code = "";
  try {
    code = (JSON.parse(body) as { error?: { code?: string } }).error?.code ?? "";
  } catch {
    // Not JSON; fall back to the status code.
  }
  if (status === 403 || code.startsWith("enrollment.disconnected") || status === 410) {
    const detail = code.includes("mfa_required")
      ? "The bank needs you to complete a security check."
      : code.includes("credentials_invalid")
        ? "The bank login details changed."
        : "The connection to this bank is no longer valid.";
    return new ApiError(502, "UPSTREAM_ERROR", `${detail} Remove this institution and add it again to reconnect.`);
  }
  if (status === 429) return new ApiError(502, "UPSTREAM_ERROR", "Teller is limiting requests right now. Wait a minute and try again.");
  if (status === 400 && code === "bad_request") {
    return new ApiError(502, "UPSTREAM_ERROR", "Teller rejected the request. Check that your Teller certificate matches your Application ID.");
  }
  if (status === 404) return new ApiError(404, "NOT_FOUND", "Teller could not find that account.");
  return new ApiError(502, "UPSTREAM_ERROR", "Teller or the bank is unavailable right now. Please try again later.");
}

async function tellerJson<T>(method: string, path: string, token: string): Promise<T> {
  const settings = readSettings();
  if (!settings) throw new ApiError(400, "BAD_REQUEST", "Teller is not configured. See the setup steps on the Institutions page.");
  let res: RawResponse;
  try {
    res = await rawRequest(method, path, token, settings);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[teller] request failed", (err as Error).message);
    throw new ApiError(502, "UPSTREAM_ERROR", "Could not reach Teller. Check your internet connection and try again.");
  }
  if (res.status < 200 || res.status >= 300) throw tellerError(res.status, res.body);
  return (res.body ? JSON.parse(res.body) : null) as T;
}

export const listAccounts = (token: string) => tellerJson<TellerAccount[]>("GET", "/accounts", token);

export function listTransactions(
  token: string,
  accountId: string,
  { count, fromId }: { count: number; fromId?: string },
): Promise<TellerTransaction[]> {
  const qs = new URLSearchParams({ count: String(count) });
  if (fromId) qs.set("from_id", fromId);
  return tellerJson<TellerTransaction[]>("GET", `/accounts/${encodeURIComponent(accountId)}/transactions?${qs}`, token);
}

/** Revokes the whole enrollment at Teller (deletes every account for this token). */
export async function revokeEnrollment(token: string): Promise<void> {
  await tellerJson<unknown>("DELETE", "/accounts", token);
}
