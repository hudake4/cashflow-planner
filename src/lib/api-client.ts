/**
 * Typed client for the CashFlow Planner API. Mirrors docs/API.md.
 * All money is integer cents; all dates are YYYY-MM-DD strings.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  BillDTO,
  BillInput,
  BillOccurrenceDTO,
  BankTransactionsResponse,
  ConnectInstitutionInput,
  DashboardResponse,
  IncomeDTO,
  IncomeInput,
  InstitutionDTO,
  InstitutionsConfigDTO,
  OccurrenceUpdateInput,
  ProjectionResponse,
  SettingsDTO,
  SettingsInput,
} from "@/contracts/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "NETWORK_ERROR";
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, code: ApiErrorCode | "NETWORK_ERROR", message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors ?? {};
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorBody).error?.message === "string"
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the app server. Is it still running?");
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(res.status, body.error.code, body.error.message, body.error.fieldErrors);
    }
    const code: ApiErrorCode = res.status === 404 ? "NOT_FOUND" : res.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new ApiError(res.status, code, res.status === 404 ? "Not found." : `Request failed (${res.status}).`);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const api = {
  getSettings: () => request<SettingsDTO>("/settings"),
  saveSettings: (input: SettingsInput) => request<SettingsDTO>("/settings", json("PUT", input)),

  listIncome: () => request<IncomeDTO[]>("/income"),
  getIncome: (id: string) => request<IncomeDTO>(`/income/${encodeURIComponent(id)}`),
  createIncome: (input: IncomeInput) => request<IncomeDTO>("/income", json("POST", input)),
  updateIncome: (id: string, input: IncomeInput) =>
    request<IncomeDTO>(`/income/${encodeURIComponent(id)}`, json("PUT", input)),
  deleteIncome: (id: string) => request<void>(`/income/${encodeURIComponent(id)}`, json("DELETE")),

  listBills: () => request<BillDTO[]>("/bills"),
  getBill: (id: string) => request<BillDTO>(`/bills/${encodeURIComponent(id)}`),
  createBill: (input: BillInput) => request<BillDTO>("/bills", json("POST", input)),
  updateBill: (id: string, input: BillInput) => request<BillDTO>(`/bills/${encodeURIComponent(id)}`, json("PUT", input)),
  deleteBill: (id: string) => request<void>(`/bills/${encodeURIComponent(id)}`, json("DELETE")),
  listOccurrences: (billId: string) =>
    request<BillOccurrenceDTO[]>(`/bills/${encodeURIComponent(billId)}/occurrences`),
  setOccurrence: (billId: string, date: string, input: OccurrenceUpdateInput) =>
    request<BillOccurrenceDTO>(`/bills/${encodeURIComponent(billId)}/occurrences/${date}`, json("PUT", input)),
  resetOccurrence: (billId: string, date: string) =>
    request<void>(`/bills/${encodeURIComponent(billId)}/occurrences/${date}`, json("DELETE")),

  getInstitutionsConfig: () => request<InstitutionsConfigDTO>("/institutions/config"),
  listInstitutions: () => request<InstitutionDTO[]>("/institutions"),
  getInstitution: (id: string) => request<InstitutionDTO>(`/institutions/${encodeURIComponent(id)}`),
  connectInstitution: (input: ConnectInstitutionInput) => request<InstitutionDTO>("/institutions", json("POST", input)),
  removeInstitution: (id: string) => request<void>(`/institutions/${encodeURIComponent(id)}`, json("DELETE")),
  listBankTransactions: (id: string, query: { accountId: string; fromId?: string }) => {
    const qs = new URLSearchParams({ accountId: query.accountId });
    if (query.fromId) qs.set("fromId", query.fromId);
    return request<BankTransactionsResponse>(`/institutions/${encodeURIComponent(id)}/transactions?${qs}`);
  },

  getProjection: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const q = qs.toString();
    return request<ProjectionResponse>(`/projection${q ? `?${q}` : ""}`);
  },
  getDashboard: () => request<DashboardResponse>("/dashboard"),

  loadDemoData: () => request<{ ok: true }>("/data/demo", json("POST")),
  resetAllData: () => request<{ ok: true }>("/data/reset", json("POST")),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
