/**
 * Typed client for the CashFlow Planner API. Mirrors docs/API.md.
 * All money is integer cents; all dates are YYYY-MM-DD strings.
 */
import type {
  AccountKind,
  ApiErrorBody,
  ApiErrorCode,
  BankAccountDTO,
  BillDTO,
  BillInput,
  BankTransactionsResponse,
  BillEstimateDTO,
  BillOccurrenceDTO,
  ConnectInstitutionInput,
  DashboardResponse,
  IncomeDTO,
  IncomeInput,
  InstitutionDTO,
  InstitutionSyncDTO,
  OccurrenceUpdateInput,
  ProjectionResponse,
  RecurringScanResponse,
  SettingsDTO,
  SettingsInput,
  SpendingCategoryInput,
  SpendingResponse,
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

  if (!res.ok) throw toApiError(res.status, body);
  return body as T;
}

function toApiError(status: number, body: unknown): ApiError {
  if (isApiErrorBody(body)) return new ApiError(status, body.error.code, body.error.message, body.error.fieldErrors);
  const code: ApiErrorCode = status === 404 ? "NOT_FOUND" : status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  return new ApiError(status, code, status === 404 ? "Not found." : `Request failed (${status}).`);
}

/** Fetches the backup file. The file name comes from the server's Content-Disposition header. */
async function downloadBackup(): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetch("/api/data/export", { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the app server. Is it still running?");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw toApiError(res.status, body);
  }
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return { blob: await res.blob(), filename: match?.[1] ?? "cashflow-planner-backup.json" };
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

  getProjection: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const q = qs.toString();
    return request<ProjectionResponse>(`/projection${q ? `?${q}` : ""}`);
  },
  getDashboard: () => request<DashboardResponse>("/dashboard"),

  listInstitutions: () => request<InstitutionDTO[]>("/institutions"),
  /** Claims a SimpleFIN setup token (one use only) and runs the first sync. */
  connectInstitution: (input: ConnectInstitutionInput) => request<InstitutionSyncDTO>("/institutions", json("POST", input)),
  syncInstitution: (id: string) => request<InstitutionSyncDTO>(`/institutions/${encodeURIComponent(id)}/sync`, json("POST")),
  removeInstitution: (id: string) => request<void>(`/institutions/${encodeURIComponent(id)}`, json("DELETE")),
  setAccountKind: (id: string, accountId: string, kind: AccountKind) =>
    request<BankAccountDTO>(
      `/institutions/${encodeURIComponent(id)}/accounts/${encodeURIComponent(accountId)}`,
      json("PATCH", { kind }),
    ),
  listBankTransactions: (id: string, { accountId, offset = 0 }: { accountId: string; offset?: number }) => {
    const qs = new URLSearchParams({ accountId, offset: String(offset) });
    return request<BankTransactionsResponse>(`/institutions/${encodeURIComponent(id)}/transactions?${qs.toString()}`);
  },

  /** Finds repeating payments/deposits in the stored bank history. Reads local data only. */
  scanRecurring: () => request<RecurringScanResponse>("/recurring"),

  /** Suggested amount for a bill from the stored bank history. Nothing is saved. Reads local data only. */
  getBillEstimate: (billId: string, date: string) =>
    request<BillEstimateDTO>(`/bills/${encodeURIComponent(billId)}/estimate?date=${date}`),

  /** Last month's and this month's spending by category from the stored bank history. Reads local data only. */
  getSpending: () => request<SpendingResponse>("/spending"),
  /** Sets (null = back to automatic) the category of one transaction; by default it is learned for the whole merchant. Returns the refreshed analysis. */
  setTransactionCategory: (transactionId: string, input: SpendingCategoryInput) =>
    request<SpendingResponse>(`/spending/transactions/${encodeURIComponent(transactionId)}/category`, json("PUT", input)),

  loadDemoData: () => request<{ ok: true }>("/data/demo", json("POST")),
  resetAllData: () => request<{ ok: true }>("/data/reset", json("POST")),
  /** The full backup as a JSON file (bank credentials are never included). */
  downloadBackup,
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
