/**
 * CashFlow Planner — shared API contract.
 *
 * This file is the single source of truth for request validation and response
 * shapes. It is imported by the API routes (server), the UI (client forms reuse
 * the same Zod schemas), and the tests. It must stay free of server-only imports.
 *
 * Conventions (full detail in docs/CONVENTIONS.md):
 *   - Money: integer cents everywhere (`...Cents` fields). Never floats.
 *   - Dates: calendar dates as "YYYY-MM-DD" strings. No times, no timezones.
 *   - Bill/income amounts are positive magnitudes; direction comes from `kind`.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in YYYY-MM-DD form (e.g. rejects 2025-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const isoDateSchema = z
  .string({ required_error: "Date is required", invalid_type_error: "Date is required" })
  .regex(ISO_DATE_PATTERN, "Use the format YYYY-MM-DD")
  .refine(isValidIsoDate, "Not a valid calendar date");

/** Largest single amount accepted: $10,000,000.00 */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

export const amountCentsSchema = z
  .number({ required_error: "Amount is required", invalid_type_error: "Amount must be a number" })
  .int("Amount must be in whole cents")
  .positive("Amount must be greater than zero")
  .max(MAX_AMOUNT_CENTS, "Amount is too large");

/** Balances may be zero or negative (e.g. an overdrawn account). */
export const balanceCentsSchema = z
  .number({ required_error: "Balance is required", invalid_type_error: "Balance must be a number" })
  .int("Balance must be in whole cents")
  .min(-MAX_AMOUNT_CENTS, "Balance is too small")
  .max(MAX_AMOUNT_CENTS, "Balance is too large");

const nameSchema = z
  .string({ required_error: "Name is required", invalid_type_error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be 80 characters or fewer");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalDate = z
  .union([isoDateSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const INCOME_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "ONE_TIME"] as const;
export const incomeFrequencySchema = z.enum(INCOME_FREQUENCIES, {
  errorMap: () => ({ message: "Frequency must be weekly, biweekly, monthly, or one-time" }),
});
export type IncomeFrequency = z.infer<typeof incomeFrequencySchema>;

export const BILL_FREQUENCIES = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export const billFrequencySchema = z.enum(BILL_FREQUENCIES, {
  errorMap: () => ({ message: "Frequency must be one-time, weekly, biweekly, monthly, quarterly, or yearly" }),
});
export type BillFrequency = z.infer<typeof billFrequencySchema>;

export const OCCURRENCE_STATUSES = ["UPCOMING", "PAID", "SKIPPED"] as const;
export const occurrenceStatusSchema = z.enum(OCCURRENCE_STATUSES, {
  errorMap: () => ({ message: "Status must be upcoming, paid, or skipped" }),
});
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;

export const CALENDAR_VIEWS = ["month", "week"] as const;
export const calendarViewSchema = z.enum(CALENDAR_VIEWS);
export type CalendarView = z.infer<typeof calendarViewSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const MIN_FORECAST_DAYS = 7;
export const MAX_FORECAST_DAYS = 366;
export const DEFAULT_FORECAST_DAYS = 90;

export const STARTING_BALANCE_SOURCES = ["MANUAL", "ACCOUNTS"] as const;
export const startingBalanceSourceSchema = z.enum(STARTING_BALANCE_SOURCES, {
  errorMap: () => ({ message: "Starting balance source must be manual or accounts" }),
});
export type StartingBalanceSource = z.infer<typeof startingBalanceSourceSchema>;

export const settingsInputSchema = z.object({
  startingBalanceCents: balanceCentsSchema,
  startingBalanceSource: startingBalanceSourceSchema.default("MANUAL"),
  projectionStartDate: isoDateSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code such as USD"),
  forecastDays: z
    .number({ invalid_type_error: "Forecast length must be a number" })
    .int("Forecast length must be a whole number of days")
    .min(MIN_FORECAST_DAYS, `Forecast must be at least ${MIN_FORECAST_DAYS} days`)
    .max(MAX_FORECAST_DAYS, `Forecast can be at most ${MAX_FORECAST_DAYS} days (12 months)`),
  weekStartsOn: z
    .number()
    .int()
    .min(0, "Week start must be a day from 0 (Sunday) to 6 (Saturday)")
    .max(6, "Week start must be a day from 0 (Sunday) to 6 (Saturday)"),
  defaultCalendarView: calendarViewSchema.default("month"),
  desktopNotifications: z.boolean({ invalid_type_error: "Desktop notifications must be on or off" }).default(true),
  balanceFloorCents: balanceCentsSchema.default(0),
});
export type SettingsInput = z.input<typeof settingsInputSchema>;

export interface SettingsDTO {
  /** The balance the user typed. Used when `startingBalanceSource` is MANUAL (or no accounts are connected). */
  startingBalanceCents: number;
  startingBalanceSource: StartingBalanceSource;
  /** Sum of the accounts labelled BANK; null when there are none. */
  accountsBalanceCents: number | null;
  /** How many accounts are labelled BANK (the ones in `accountsBalanceCents`). */
  accountCount: number;
  /**
   * The oldest `balanceDate` among the accounts labelled BANK that refreshed within the last 7 days
   * (all of them when none did), capped at today; null when there are none. With the ACCOUNTS source
   * it is the date the projection starts on (`effectiveProjectionStartDate`).
   */
  accountsBalanceDate: string | null;
  /**
   * How many BANK accounts were left out of `accountsBalanceDate` because they haven't refreshed in
   * over 7 days. Their balance is still in `accountsBalanceCents`. 0 when every account is equally
   * stale (the date then comes from all of them).
   */
  accountsStaleCount: number;
  /** The start date the user typed. Used when `startingBalanceSource` is MANUAL (or no accounts are connected). */
  projectionStartDate: string;
  currency: string;
  forecastDays: number;
  weekStartsOn: number;
  defaultCalendarView: CalendarView;
  /** Whether the desktop app shows notifications (CONVENTIONS section 16). The web app ignores it. */
  desktopNotifications: boolean;
  /** Lowest projected balance the user wants to stay above (safe-to-spend). */
  balanceFloorCents: number;
  updatedAt: string | null; // null when defaults have never been saved
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export const incomeInputSchema = z
  .object({
    name: nameSchema,
    amountCents: amountCentsSchema,
    frequency: incomeFrequencySchema,
    anchorDate: isoDateSchema, // first or next expected payday
    endDate: optionalDate, // inclusive; ignored for ONE_TIME
    active: z.boolean().default(true),
    notes: optionalText(500, "Notes"),
  })
  .refine((v) => !v.endDate || v.endDate >= v.anchorDate, {
    path: ["endDate"],
    message: "End date must be on or after the first payday",
  });
export type IncomeInput = z.input<typeof incomeInputSchema>;

export interface IncomeDTO {
  id: string;
  name: string;
  amountCents: number;
  frequency: IncomeFrequency;
  anchorDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export const billInputSchema = z
  .object({
    name: nameSchema,
    amountCents: amountCentsSchema, // default amount per occurrence
    frequency: billFrequencySchema,
    anchorDate: isoDateSchema, // first or next due date
    endDate: optionalDate, // inclusive; ignored for ONE_TIME
    category: optionalText(40, "Category"),
    notes: optionalText(500, "Notes"),
    active: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.anchorDate, {
    path: ["endDate"],
    message: "End date must be on or after the first due date",
  });
export type BillInput = z.input<typeof billInputSchema>;

export interface BillDTO {
  id: string;
  name: string;
  amountCents: number;
  frequency: BillFrequency;
  anchorDate: string;
  endDate: string | null;
  category: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Bill occurrences (per-date status / amount override)
// ---------------------------------------------------------------------------

export const occurrenceUpdateSchema = z.object({
  status: occurrenceStatusSchema,
  /** Optional per-occurrence amount for variable bills; null clears the override. */
  amountOverrideCents: amountCentsSchema.nullish().transform((v) => v ?? null),
  note: optionalText(200, "Note"),
});
export type OccurrenceUpdateInput = z.input<typeof occurrenceUpdateSchema>;

export interface BillOccurrenceDTO {
  billId: string;
  dueDate: string;
  status: OccurrenceStatus;
  amountOverrideCents: number | null;
  note: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export const projectionQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ["to"],
    message: "'to' must be on or after 'from'",
  });
export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;

export type LedgerEventKind = "INCOME" | "BILL";

export interface LedgerEvent {
  /** Stable, unique id: `${kind}:${sourceId}:${date}`. Never duplicated. */
  id: string;
  date: string;
  kind: LedgerEventKind;
  sourceId: string; // IncomeSource.id or Bill.id
  name: string;
  category: string | null;
  frequency: IncomeFrequency | BillFrequency;
  /** Positive magnitude actually used (override applied for bills). */
  amountCents: number;
  /** +amount for income, -amount for bills, 0 when not included (skipped). */
  signedAmountCents: number;
  /** Bills: UPCOMING | PAID | SKIPPED. Income: always "SCHEDULED". */
  status: OccurrenceStatus | "SCHEDULED";
  /** False only for SKIPPED bill occurrences; they appear for transparency but do not change the balance. */
  included: boolean;
  /** True when amountCents comes from a per-occurrence override. */
  amountOverridden: boolean;
  /** Global chronological position (0-based) in the projection ledger. */
  sequence: number;
  /** Running balance immediately after this event. */
  balanceAfterCents: number;
}

export interface DaySummary {
  date: string;
  openingBalanceCents: number; // before any events on this date
  incomeCents: number; // included income only
  billsCents: number; // included bills only (positive magnitude)
  netCents: number; // incomeCents - billsCents
  closingBalanceCents: number; // openingBalanceCents + netCents
  eventIds: string[]; // in ledger order, including skipped events
}

export interface WeekSummary {
  weekStart: string; // calendar start of the week (per weekStartsOn)
  weekEnd: string; // weekStart + 6 days
  /** First/last date of this week that lies inside the returned range (see docs/API.md). */
  rangeStart: string;
  rangeEnd: string;
  partial: boolean; // true when the week is clipped by the returned range (either side)
  openingBalanceCents: number;
  incomeCents: number;
  billsCents: number;
  netCents: number;
  closingBalanceCents: number; // openingBalanceCents + netCents
  lowestBalanceCents: number; // min end-of-day balance in the week (incl. opening)
  hasNegative: boolean; // lowestBalanceCents < 0
  eventIds: string[];
}

export interface ProjectionTotals {
  incomeCents: number;
  billsCents: number;
  netCents: number;
  openingBalanceCents: number;
  endingBalanceCents: number;
  lowestBalanceCents: number;
  lowestBalanceDate: string;
  firstNegativeDate: string | null;
  negativeDayCount: number;
}

export interface ProjectionResponse {
  /** Full projection window from settings: [projectionStartDate, projectionStartDate + forecastDays - 1]. */
  window: { startDate: string; endDate: string; maxEndDate: string };
  /** The slice actually returned, after clamping the requested from/to into the computable range. */
  range: { from: string; to: string };
  currency: string;
  weekStartsOn: number;
  startingBalanceCents: number;
  /** Events whose date lies in `range`, in ledger order. */
  events: LedgerEvent[];
  /** One entry per date in `range`. */
  days: DaySummary[];
  /** Weeks overlapping `range`, each clipped to `range` (they partition `events` exactly). */
  weeks: WeekSummary[];
  /** Totals over `range`. */
  totals: ProjectionTotals;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardResponse {
  /** Server's local "today". */
  today: string;
  settings: SettingsDTO;
  window: { startDate: string; endDate: string };
  /** True when there is at least one active income source or bill. */
  hasData: boolean;
  nextPaycheck: { date: string; name: string; amountCents: number; sourceId: string } | null;
  /** Next up to 8 non-skipped bill events within 14 days of the reference date. */
  upcomingBills: LedgerEvent[];
  /** Week containing the reference date (today, or the projection start if today is before it). */
  currentWeek: WeekSummary | null;
  nextWeek: WeekSummary | null;
  totals: ProjectionTotals; // over the full forecast window
  /** End-of-day balance for every date in the window (for the trend chart). */
  trend: { date: string; balanceCents: number }[];
  /** Most the user can spend today without any future end-of-day balance dropping below the configured floor. */
  safeToSpendCents: number;
  /** Bills in the pay period ending at the forecast low point and their moved-date impact. */
  lowPoint: LowPointInsight | null;
}

export interface LowPointBill {
  /** Projection event and source bill identifiers. */
  eventId: string;
  billId: string;
  /** Bill label, original due date, and occurrence amount. */
  name: string;
  date: string;
  amountCents: number;
  /** Lowest end-of-day balance over the window if this one occurrence were due on payday. */
  lowestIfMovedCents: number;
  /** Date of the recomputed window low after moving this occurrence. */
  lowestIfMovedDate: string;
}
export interface LowPointInsight {
  /** Date and balance of the projected window low. */
  date: string;
  balanceCents: number;
  /** First income event after the low point. */
  payday: { date: string; name: string; amountCents: number };
  /** Eligible bills whose move improves the window low. */
  bills: LowPointBill[];
}

// ---------------------------------------------------------------------------
// Alerts (desktop notifications)
// ---------------------------------------------------------------------------

export type AlertKind = "LOW_BALANCE" | "BILL_DUE";

export interface AlertDTO {
  /** Stable for the same event, so a client can remember which alerts it already showed. */
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Last date the alert is still relevant (YYYY-MM-DD). A client can forget the key after it. */
  expiresOn: string;
}

export interface AlertsResponse {
  /** Server's local "today". */
  today: string;
  /** The "Desktop notifications" setting. When false, `alerts` is empty and a client must not remember anything. */
  enabled: boolean;
  alerts: AlertDTO[];
}

// ---------------------------------------------------------------------------
// Institutions (SimpleFIN Bridge bank connections, read-only)
// ---------------------------------------------------------------------------
// Only src/server/simplefin.ts ever sees a setup token or access URL. No DTO below
// carries an access URL. Bank amounts are SIGNED like SimpleFIN: money in is positive,
// money out is negative (the opposite of bills, which are positive magnitudes).

/** Transactions returned per page by GET /api/institutions/:id/transactions. */
export const BANK_TRANSACTIONS_PAGE_SIZE = 50;

/** Minimum time between two syncs of one connection (SimpleFIN allows 24 requests/day). */
export const MIN_SYNC_INTERVAL_MINUTES = 15;

export const connectInstitutionSchema = z.object({
  setupToken: z
    .string({ required_error: "Paste your SimpleFIN setup token", invalid_type_error: "Paste your SimpleFIN setup token" })
    .trim()
    .min(1, "Paste your SimpleFIN setup token")
    .max(2000, "That doesn't look like a setup token (too long)"),
});
export type ConnectInstitutionInput = z.input<typeof connectInstitutionSchema>;

export const bankTransactionsQuerySchema = z.object({
  accountId: z.string({ required_error: "accountId is required" }).trim().min(1, "accountId is required"),
  offset: z.coerce.number().int("offset must be a whole number").min(0, "offset must be 0 or more").default(0),
});
export type BankTransactionsQuery = z.output<typeof bankTransactionsQuerySchema>;

/**
 * How the user labels a connected account. Only BANK accounts count toward the starting balance
 * (CONVENTIONS section 3); the other kinds are shown but never summed.
 */
export const ACCOUNT_KINDS = ["BANK", "CREDIT", "LOAN", "OTHER"] as const;
export const accountKindSchema = z.enum(ACCOUNT_KINDS, {
  errorMap: () => ({ message: "Account type must be bank, credit, loan or other" }),
});
export type AccountKind = z.infer<typeof accountKindSchema>;

export const accountKindInputSchema = z.object({ kind: accountKindSchema });
export type AccountKindInput = z.input<typeof accountKindInputSchema>;

export const accountCardFieldsInputSchema = z.object({
  statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
  paymentDueDay: z.number().int().min(1).max(31).nullable().optional(),
  aprBasisPoints: z.number().int().min(0).max(100000).nullable().optional(),
  minimumPaymentRule: z.string().trim().max(200).nullable().optional(),
});
export type AccountCardFieldsInput = z.input<typeof accountCardFieldsInputSchema>;

export const accountUpdateInputSchema = z
  .object({
    kind: accountKindSchema.optional(),
    statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
    paymentDueDay: z.number().int().min(1).max(31).nullable().optional(),
    aprBasisPoints: z.number().int().min(0).max(100000).nullable().optional(),
    minimumPaymentRule: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (v) =>
      v.kind !== undefined ||
      v.statementClosingDay !== undefined ||
      v.paymentDueDay !== undefined ||
      v.aprBasisPoints !== undefined ||
      v.minimumPaymentRule !== undefined,
    { path: ["kind"], message: "At least one field is required" },
  );
export type AccountUpdateInput = z.input<typeof accountUpdateInputSchema>;

export interface BankAccountDTO {
  id: string;
  name: string;
  institutionName: string;
  /** The user's label. Only BANK accounts are summed into the starting balance. */
  kind: AccountKind;
  /** 3-letter currency code. */
  currency: string;
  balanceCents: number;
  availableBalanceCents: number | null;
  /** YYYY-MM-DD: when the bank reported this balance (UTC date). */
  balanceDate: string;
  /** Credit-card fields (user-entered). Null/undefined for non-card accounts or unset. */
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  aprBasisPoints: number | null;
  minimumPaymentRule: string | null;
}

export interface InstitutionDTO {
  id: string;
  /** The bank name(s) reported by SimpleFIN, or "SimpleFIN connection" before any account is known. */
  name: string;
  connectedAt: string;
  /** ISO timestamp of the last successful sync; null if no sync has succeeded yet. */
  lastSyncedAt: string | null;
  accounts: BankAccountDTO[];
}

/** Returned by connect and sync: the connection plus any notices SimpleFIN reported. */
export interface InstitutionSyncDTO extends InstitutionDTO {
  warnings: string[];
}

export interface BankTransactionDTO {
  id: string;
  accountId: string;
  date: string;
  description: string;
  /** Signed: money in positive, money out negative. */
  amountCents: number;
  pending: boolean;
}

export interface BankTransactionsResponse {
  transactions: BankTransactionDTO[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Recurring-payment scan (reads the stored bank transactions; never calls SimpleFIN)
// ---------------------------------------------------------------------------

/** Frequencies the scan can recognise in the 89-day history window (quarterly/yearly can't repeat within it). */
export const RECURRING_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

/** One repeating payment or deposit found in the bank history, ready to become a bill or income source. */
export interface RecurringSuggestionDTO {
  /** Stable across scans (`INCOME:netflix`), so the UI can track which ones the user already handled. */
  key: string;
  kind: LedgerEventKind;
  /** Cleaned-up merchant or payer name, at most 80 characters. */
  name: string;
  /** Positive magnitude of the most recent occurrence. */
  amountCents: number;
  frequency: RecurringFrequency;
  /** The next expected date on or after today: used as the bill's due date or the income's payday. */
  nextDate: string;
  /** How many times it appeared in the history window. */
  occurrences: number;
  /** Dates it was seen on, ascending. */
  seenDates: string[];
  /** True when the amounts differ noticeably between occurrences (the amount shown is the latest). */
  amountVaries: boolean;
}

export interface RecurringScanResponse {
  suggestions: RecurringSuggestionDTO[];
  /** Currency for display (the app's currency setting). */
  currency: string;
  /** Bank connections stored locally; 0 means there is nothing to scan yet. */
  connectionCount: number;
  /** Settled transactions examined (pending ones are ignored). */
  transactionCount: number;
  /** ISO timestamp of the most recent successful sync across connections; null if none has succeeded. */
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Subscription audit (reads the stored bank transactions and the tracked bills; never calls SimpleFIN)
// ---------------------------------------------------------------------------

/** The subscription audit: detected recurring charges (bills only) plus the subscriptions the user already tracks. */
export interface SubscriptionAuditResponse {
  /** Detected recurring charges (BILL kind only), excluding any the user dismissed as "not a subscription". */
  suggestions: RecurringSuggestionDTO[];
  /** The user's tracked bills (any frequency); the view marks them as already tracked. */
  tracked: BillDTO[];
  /** Currency for display (the app's currency setting). */
  currency: string;
  /** Bank connections stored locally; 0 means there is nothing to scan yet. */
  connectionCount: number;
  /** Settled transactions examined (pending ones are ignored). */
  transactionCount: number;
  /** ISO timestamp of the most recent successful sync across connections; null if none has succeeded. */
  lastSyncedAt: string | null;
}

export const dismissSubscriptionInputSchema = z.object({
  /** Stable suggestion key, e.g. "BILL:netflix com". */
  key: z.string().min(1).max(200),
});
export type DismissSubscriptionInput = z.infer<typeof dismissSubscriptionInputSchema>;

// ---------------------------------------------------------------------------
// Bill payment matches (reads the stored bank transactions; never calls SimpleFIN)
// ---------------------------------------------------------------------------

/** A synced bank transaction that looks like the payment of one unpaid bill occurrence. Only an offer: nothing is marked until the user confirms. */
export interface BillPaymentMatchDTO {
  billId: string;
  billName: string;
  /** The scheduled due date of the occurrence the payment matches. */
  dueDate: string;
  /** What the occurrence is expected to cost (its amount override, else the bill's amount). Positive magnitude. */
  expectedCents: number;
  /** The occurrence's recorded override and note, so marking it paid can keep them. */
  amountOverrideCents: number | null;
  note: string | null;
  transaction: {
    id: string;
    date: string;
    description: string;
    /** Positive magnitude of the money out. */
    cents: number;
  };
}

export interface BillMatchesResponse {
  matches: BillPaymentMatchDTO[];
  currency: string;
}

// ---------------------------------------------------------------------------
// Bill amount estimate (reads the stored bank transactions; never calls SimpleFIN)
// ---------------------------------------------------------------------------

/** ROLLING: average of the latest complete periods. SEASONAL: average of the same month in earlier years. */
export type BillEstimateMethod = "ROLLING" | "SEASONAL";

/** Why no estimate was made. */
export type BillEstimateReason = "NO_BANK_DATA" | "NO_MATCHES" | "TOO_FEW_PERIODS" | "UNSUPPORTED_FREQUENCY";

export interface BillEstimateValueDTO {
  /** Positive magnitude, integer cents. */
  amountCents: number;
  method: BillEstimateMethod;
  /** How many periods (weeks, 2-week periods or calendar months) the average is over. */
  periodCount: number;
  /** First and last bank transaction date that went into it. */
  firstDate: string;
  lastDate: string;
}

/** A suggestion only: nothing is stored or applied until the user saves it as a per-date amount. */
export interface BillEstimateDTO {
  estimate: BillEstimateValueDTO | null;
  /** Set exactly when `estimate` is null. */
  reason: BillEstimateReason | null;
  currency: string;
}

// ---------------------------------------------------------------------------
// Data export (backup file from GET /api/data/export)
// ---------------------------------------------------------------------------
// Everything the user entered plus the stored bank snapshot, as a single JSON file.
// It never carries an access URL, setup token or any other BankConnection column
// besides id, name, connectedAt and lastSyncedAt.

export const DATA_EXPORT_FORMAT = "cashflow-planner-export";
export const DATA_EXPORT_FORMAT_VERSION = 1;

const timestampSchema = z.string().datetime();
const signedCentsSchema = z.number().int();

const settingsDTOSchema = z.object({
  startingBalanceCents: balanceCentsSchema,
  startingBalanceSource: startingBalanceSourceSchema,
  accountsBalanceCents: signedCentsSchema.nullable(),
  accountCount: z.number().int().min(0),
  accountsBalanceDate: isoDateSchema.nullable(),
  accountsStaleCount: z.number().int().min(0),
  projectionStartDate: isoDateSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  forecastDays: z.number().int().min(MIN_FORECAST_DAYS).max(MAX_FORECAST_DAYS),
  weekStartsOn: z.number().int().min(0).max(6),
  defaultCalendarView: calendarViewSchema,
  desktopNotifications: z.boolean(),
  balanceFloorCents: balanceCentsSchema,
  updatedAt: timestampSchema.nullable(),
});

const incomeDTOSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  amountCents: amountCentsSchema,
  frequency: incomeFrequencySchema,
  anchorDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const billDTOSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  amountCents: amountCentsSchema,
  frequency: billFrequencySchema,
  anchorDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  category: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const billOccurrenceDTOSchema = z.object({
  billId: z.string().min(1),
  dueDate: isoDateSchema,
  status: occurrenceStatusSchema,
  amountOverrideCents: amountCentsSchema.nullable(),
  note: z.string().nullable(),
  updatedAt: timestampSchema,
});

const bankAccountDTOSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    institutionName: z.string(),
    kind: accountKindSchema,
    currency: z.string(),
    balanceCents: signedCentsSchema,
    availableBalanceCents: signedCentsSchema.nullable(),
    balanceDate: isoDateSchema,
    statementClosingDay: z.number().int().min(1).max(31).nullable(),
    paymentDueDay: z.number().int().min(1).max(31).nullable(),
    aprBasisPoints: z.number().int().min(0).max(100000).nullable(),
    minimumPaymentRule: z.string().nullable(),
  })
  .strict();

const bankTransactionDTOSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    date: isoDateSchema,
    description: z.string(),
    amountCents: signedCentsSchema,
    pending: z.boolean(),
  })
  .strict();

/** Strict: a connection in the export may carry no other field (no credentials). */
const exportedInstitutionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    connectedAt: timestampSchema,
    lastSyncedAt: timestampSchema.nullable(),
    accounts: z.array(bankAccountDTOSchema),
    /** Every stored transaction of the connection's accounts, newest first. */
    transactions: z.array(bankTransactionDTOSchema),
  })
  .strict();

export const dataExportSchema = z.object({
  format: z.literal(DATA_EXPORT_FORMAT),
  formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION),
  /** package.json version of the build that wrote the file. */
  appVersion: z.string().min(1),
  exportedAt: timestampSchema,
  settings: settingsDTOSchema,
  incomes: z.array(incomeDTOSchema),
  bills: z.array(billDTOSchema),
  /** Every recorded status row for every bill (no row means UPCOMING at the default amount). */
  billOccurrences: z.array(billOccurrenceDTOSchema),
  institutions: z.array(exportedInstitutionSchema),
});

/** Accept every formatVersion 1 file since v0.12.0; ignored fields may be absent or older-shaped. */
export const dataRestoreSchema = z.object({
  format: z.literal(DATA_EXPORT_FORMAT),
  formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION),
  appVersion: z.string().min(1),
  exportedAt: timestampSchema,
  settings: settingsDTOSchema.extend({
    accountsBalanceCents: signedCentsSchema.nullable().optional(),
    accountCount: z.number().int().min(0).optional(),
    accountsBalanceDate: isoDateSchema.nullable().optional(),
    accountsStaleCount: z.number().int().min(0).optional(),
    desktopNotifications: z.boolean().optional(),
    balanceFloorCents: balanceCentsSchema.optional(),
    updatedAt: timestampSchema.nullable().optional(),
  }),
  incomes: z.array(incomeDTOSchema),
  bills: z.array(billDTOSchema),
  billOccurrences: z.array(billOccurrenceDTOSchema),
  institutions: z.array(z.unknown()),
});
export type DataRestoreInput = z.output<typeof dataRestoreSchema>;

/** InstitutionDTO (id, name, connectedAt, lastSyncedAt, accounts) plus the stored transactions. */
export interface ExportedInstitutionDTO extends InstitutionDTO {
  transactions: BankTransactionDTO[];
}

export interface DataExportDTO {
  format: typeof DATA_EXPORT_FORMAT;
  formatVersion: typeof DATA_EXPORT_FORMAT_VERSION;
  appVersion: string;
  exportedAt: string;
  settings: SettingsDTO;
  incomes: IncomeDTO[];
  bills: BillDTO[];
  billOccurrences: BillOccurrenceDTO[];
  institutions: ExportedInstitutionDTO[];
}

// The schema and the DTO interfaces must describe the same shape.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const exportSchemaMatchesDTO: Same<z.output<typeof dataExportSchema>, DataExportDTO> = true;
void exportSchemaMatchesDTO;

// ---------------------------------------------------------------------------
// Spend analyzer (reads the stored bank transactions; never calls SimpleFIN)
// ---------------------------------------------------------------------------

/** Display order. TRANSFERS is tracked separately and never counts as spending. OTHER is the fallback. */
export const SPENDING_CATEGORIES = [
  "GROCERIES",
  "DINING",
  "GAS",
  "UTILITIES",
  "BILLS",
  "SHOPPING",
  "TRANSPORT",
  "ENTERTAINMENT",
  "HEALTH",
  "TRANSFERS",
  "OTHER",
] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

/** Where a transaction's category came from: keyword rules, a learned merchant rule, or the user's choice for this one. */
export type SpendingCategorySource = "AUTO" | "MERCHANT" | "MANUAL";

/** `PUT /api/spending/transactions/:id/category`. A null category goes back to the automatic one. */
export const spendingCategoryInputSchema = z
  .object({
    category: z.enum(SPENDING_CATEGORIES).nullable(),
    /** Teach the analyzer: every transaction from the same merchant, now and later, gets this category. */
    applyToMerchant: z.boolean().default(true),
  })
  .strict();
export type SpendingCategoryInput = z.input<typeof spendingCategoryInputSchema>;

export interface SpendingTransactionDTO {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Cleaned-up merchant name, the same one the merchant list uses. */
  name: string;
  /** The bank's description, as stored. */
  description: string;
  /** Positive magnitude of money out. */
  cents: number;
  category: SpendingCategory;
  source: SpendingCategorySource;
  /** False when the description has no usable name, so a merchant-wide rule isn't possible. */
  merchantLearnable: boolean;
}

export interface SpendingCategoryTotalDTO {
  category: SpendingCategory;
  /** Positive magnitude of money out. */
  totalCents: number;
  transactionCount: number;
}

export interface SpendingMerchantDTO {
  /** Cleaned-up merchant name. */
  name: string;
  category: SpendingCategory;
  totalCents: number;
  transactionCount: number;
}

export interface SpendingPeriodDTO {
  /** First day of the calendar month, YYYY-MM-DD. */
  from: string;
  /** Last day counted (inclusive): today for the current month, the month's last day for last month. */
  to: string;
  /** Total spending, excluding TRANSFERS. Positive magnitude. */
  totalCents: number;
  transactionCount: number;
  /** Money moved between accounts or paid to a card. Not part of totalCents. */
  transfersCents: number;
  /** Categories with spending, largest first. Excludes TRANSFERS. */
  categories: SpendingCategoryTotalDTO[];
  /** Up to 5 merchants with the most spending, largest first. */
  topMerchants: SpendingMerchantDTO[];
  /** Every money-out transaction in the period, TRANSFERS included, newest first, so any of them can be recategorized. */
  transactions: SpendingTransactionDTO[];
}

export interface SpendingAnalysisDTO {
  thisMonth: SpendingPeriodDTO;
  lastMonth: SpendingPeriodDTO;
  /** Last month's spending from the 1st through the same day-of-month as today (clamped to the month's length). */
  lastMonthToDateCents: number;
  /** Earliest settled transaction date in the stored history; null when there are none. */
  coverageStart: string | null;
}

export interface SpendingResponse extends SpendingAnalysisDTO {
  currency: string;
  /** Bank connections stored locally; 0 means there is nothing to analyze yet. */
  connectionCount: number;
  /** Settled transactions examined (pending ones are ignored). */
  transactionCount: number;
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

export const savingsGoalInputSchema = z.object({
  name: optionalText(80, "Name"),
  targetAmountCents: amountCentsSchema,
  targetDate: isoDateSchema,
});
export type SavingsGoalInput = z.input<typeof savingsGoalInputSchema>;

export interface SavingsGoalDTO {
  id: string;
  name: string | null;
  targetAmountCents: number;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
}
// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field path (dot-joined) -> messages. Present for VALIDATION_ERROR. */
    fieldErrors?: Record<string, string[]>;
  };
}

// ---------------------------------------------------------------------------
// Scenarios (what-if)
// ---------------------------------------------------------------------------

export const SCENARIO_KINDS = ["ADD_BILL", "ADD_INCOME", "REMOVE_BILL", "REMOVE_INCOME"] as const;
export const scenarioKindSchema = z.enum(SCENARIO_KINDS, {
  errorMap: () => ({ message: "Scenario kind must be ADD_BILL, ADD_INCOME, REMOVE_BILL, or REMOVE_INCOME" }),
});
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

export const scenarioInputSchema = z
  .object({
    kind: scenarioKindSchema,
    name: nameSchema.optional(),
    amountCents: amountCentsSchema.optional(),
    /** Alias for amountCents (cents). */
    amount: z.number().int().positive().max(MAX_AMOUNT_CENTS).optional(),
    date: isoDateSchema.optional(),
    dueDate: isoDateSchema.optional(),
    anchorDate: isoDateSchema.optional(),
    onDate: isoDateSchema.optional(),
    frequency: z.string().trim().max(20).optional(),
    id: z.string().optional(),
    sourceId: z.string().optional(),
    billId: z.string().optional(),
    incomeId: z.string().optional(),
    targetId: z.string().optional(),
    removeId: z.string().optional(),
  })
  .passthrough();
export type Scenario = z.infer<typeof scenarioInputSchema>;
export type ScenarioInput = z.input<typeof scenarioInputSchema>;

export const scenarioSchema = scenarioInputSchema;
