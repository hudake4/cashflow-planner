# CashFlow Planner — API Contract

Base URL: `http://localhost:3000/api`. JSON in and out. Types and Zod schemas are in [`src/contracts/api.ts`](../src/contracts/api.ts). Rules are in [`CONVENTIONS.md`](CONVENTIONS.md).

Errors always use this shape (`ApiErrorBody`):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please fix the highlighted fields.", "fieldErrors": { "amountCents": ["Amount must be greater than zero"] } } }
```
| Status | code |
|---|---|
| 400 | `VALIDATION_ERROR` (Zod failure, with `fieldErrors`) or `BAD_REQUEST` (malformed JSON, bad occurrence date, …) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (e.g. a bank refresh within 15 minutes of the last one) |
| 502 | `UPSTREAM_ERROR` (SimpleFIN Bridge failed, was revoked, needs payment or is rate limiting; the message says what to do) |
| 500 | `INTERNAL_ERROR` (generic message; details only in the server log) |

`fieldErrors` keys are dot-joined Zod paths (e.g. `endDate`, `to`). An object-level issue with no path uses the key `_root`.

## Settings
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/settings` | — | `SettingsDTO`. Returns defaults when never saved: balance 0, start = today, USD, 90 days, Sunday, month, desktop notifications on, debt payoff monthly payment `debtMonthlyPaymentCents: 50000` ($500.00), `updatedAt: null`. `startingBalanceCents` and `projectionStartDate` are the values as stored (what the user typed). `accountsBalanceCents`, `accountCount`, `accountsBalanceDate` and `accountsStaleCount` are derived from the accounts labelled `BANK` and are never stored: the total, the count, the oldest `balanceDate` among the accounts refreshed in the last 7 days (the oldest overall when none is that fresh, never later than the server's local today; `null` when there are no accounts) and how many accounts were left out of that date as stale (their balance is still in the total; `0` when none, or when all are equally stale). With `startingBalanceSource: "ACCOUNTS"` and at least one `BANK` account, the projection starts from the total on `accountsBalanceDate`; otherwise from the typed balance on `projectionStartDate`. |
| PUT | `/api/settings` | `SettingsInput` (full object) | `SettingsDTO`. `desktopNotifications` (boolean) is optional and defaults to `true` when omitted. `debtMonthlyPaymentCents` (integer cents, 0 to 1,000,000,000) is optional; when omitted the stored value is left alone (the Settings form doesn't edit it), so this is never reset by a save of the other settings. |
| PATCH | `/api/settings` | `{ debtMonthlyPaymentCents }` | `SettingsDTO`. Changes only the listed setting; the Debt payoff page saves its total monthly payment this way. Creates the settings row from the defaults when none was saved yet. 400 `VALIDATION_ERROR` for a missing, negative, non-integer or oversized value. |

## Income
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/income` | — | `IncomeDTO[]` (sorted by name) |
| POST | `/api/income` | `IncomeInput` | `201 IncomeDTO` |
| GET | `/api/income/:id` | — | `IncomeDTO` / 404 |
| PUT | `/api/income/:id` | `IncomeInput` (full replacement) | `IncomeDTO` / 404 |
| DELETE | `/api/income/:id` | — | `204` / 404 |

## Bills
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/bills` | — | `BillDTO[]` (sorted by name) |
| POST | `/api/bills` | `BillInput` | `201 BillDTO` |
| GET | `/api/bills/:id` | — | `BillDTO` / 404 |
| PUT | `/api/bills/:id` | `BillInput` (full replacement; never touches occurrence rows) | `BillDTO` / 404 |
| DELETE | `/api/bills/:id` | — | `204` / 404 (cascades occurrence rows) |
| GET | `/api/bills/:id/occurrences` | — | `BillOccurrenceDTO[]` (recorded statuses, sorted by `dueDate`) / 404 |
| PUT | `/api/bills/:id/occurrences/:date` | `OccurrenceUpdateInput` | `BillOccurrenceDTO` (upsert). 404 for an unknown bill. 400 `BAD_REQUEST` if `:date` isn't a valid YYYY-MM-DD date or isn't a scheduled occurrence of the bill. |
| DELETE | `/api/bills/:id/occurrences/:date` | — | `204` (resets to UPCOMING at the default amount; idempotent, so it also returns 204 when nothing was recorded) / 404 for an unknown bill |

## Projection & dashboard
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/projection` | `from?`, `to?` (YYYY-MM-DD). The default is the full window. `from` is clamped to the effective start date (`projectionStartDate`, or `accountsBalanceDate` when the balance comes from the accounts), and `to` is clamped to `maxEndDate`. | `ProjectionResponse` |
| GET | `/api/dashboard` | — | `DashboardResponse` (including `lowPointBills`, bills whose move to the next payday would raise the projected low). Its `settings` carry the effective starting balance and start date, as the projection used them. `safeToSpendCents` already accounts for savings goals, and `goalReserve` `{ setAsideCents, goals, limitedBy }` says how (CONVENTIONS section 8, "Safe to spend and savings goals"). |
| GET | `/api/alerts` | — | `AlertsResponse` `{ today, enabled, alerts }`: what the desktop app may notify about right now (CONVENTIONS section 16). `enabled` is the `desktopNotifications` setting; when it is `false`, `alerts` is empty. Each `AlertDTO` is `{ key, kind: LOW_BALANCE \| BILL_DUE \| MISSED_PAYCHECK, title, body, expiresOn }`. The `key` is stable for the same event, so a client can remember what it already showed and forget the key after `expiresOn`. Read-only; the server stores nothing. |

Projection slicing details:
- An empty `from`/`to` value is treated as missing. `from > to` (as requested) → 400 `VALIDATION_ERROR` on `to`. If clamping leaves `from` after `to` (e.g. only `from` is given and it is past the window end), the range becomes the single day `from`.
- `weeks` are clipped to the returned `range`. A week's `rangeStart`/`rangeEnd` are its first and last dates inside `range`, `partial` is true when the week is cut on either side, and its opening is the closing balance of the day before `rangeStart`. So the week and day `eventIds` partition `events` exactly. To show whole calendar weeks, request a `from`/`to` aligned to week boundaries.
- `sequence` and `balanceAfterCents` are global (computed from `projectionStartDate`), so they are identical across different slices.
- `totals.lowestBalanceDate`: the range's opening balance counts as the first day's value, and ties pick the earliest date. `firstNegativeDate` is the first day of the range when the opening balance is already negative.

## Exports (CSV and PDF)
Downloads built from the same projection as `/api/projection`, so the numbers always match the calendar. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 18. Both are read only and send `Cache-Control: no-store`.

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/export/register` | `from?`, `to?` (YYYY-MM-DD), with the same defaults, clamping and validation as `/api/projection` (empty means missing; `from > to` is a 400 `VALIDATION_ERROR` on `to`; the default is the full window) | `200 text/csv; charset=utf-8` attachment named `cashflow-register-<from>-to-<to>.csv` (the dates actually covered, after clamping). One row per ledger event in ledger order. Columns: `Date`, `Name`, `Type` (`Income` or `Bill`), `Category`, `Frequency`, `Status` (`Scheduled`, `Upcoming`, `Paid`, `Skipped`), `Amount (<currency>)`, `Balance after (<currency>)`. |
| GET | `/api/export/monthly-summary` | `month` (required, `YYYY-MM`) | `200 application/pdf` attachment named `cashflow-summary-<month>.pdf`. 400 `VALIDATION_ERROR` on `month` when it is missing or not a real month. 400 `BAD_REQUEST` when the whole month is before `projectionStartDate` or after `maxEndDate`. A month the window only partly covers is exported for the dates it covers, and the PDF says so. |

CSV details: UTF-8 with a byte-order mark (so Excel reads accents correctly), CRLF line endings, fields quoted per RFC 4180. `Amount` is signed like the register (income `+`, bills `-`, a per-occurrence override applied) as an exact decimal such as `-1199.99` with no currency symbol or thousands separator. A skipped bill keeps its amount, but its `Status` is `Skipped` and `Balance after` does not change, so leave `Skipped` rows out before summing `Amount`. `Balance after` is the engine's running balance. `Frequency` uses the app's wording (`One-time`, `Weekly`, `Every 2 weeks`, `Monthly`, `Quarterly`, `Yearly`). Text cells (name, category) whose first character, after any leading whitespace, is `=`, `+`, `-`, `@`, `|`, a tab or a line break get a leading `'` so a spreadsheet cannot run them as a formula.

## Institutions (read-only bank connections through SimpleFIN Bridge)
Only the server talks to SimpleFIN (`src/server/simplefin.ts`). The setup token and the Access URL (which embeds credentials) are never returned by any endpoint. The app keeps a local snapshot (accounts, balances, transactions) and contacts SimpleFIN only on connect and on an explicit refresh, because SimpleFIN allows about 24 requests a day. Bank amounts are **signed**: money in is positive, money out is negative.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/institutions` | — | `InstitutionDTO[]` (`{ id, name, connectedAt, lastSyncedAt, accounts: BankAccountDTO[] }`, oldest connection first). Reads the local snapshot only; no SimpleFIN call. |
| POST | `/api/institutions` | `{ setupToken }` (trimmed, 1–2000 characters) | `201 InstitutionSyncDTO` (`InstitutionDTO` plus `warnings: string[]`). Claims the token (single use) at SimpleFIN, saves the connection and runs the first sync (up to the last ~90 days). 400 `BAD_REQUEST` for a malformed token, a token that doesn't point at an https `simplefin.org` host (rejected before any network call), or one that is invalid or already used; 502 `UPSTREAM_ERROR` when SimpleFIN fails. If the claim succeeds but the first sync fails, the connection is **kept** (the token can't be claimed again) and the failure is reported in `warnings`. |
| POST | `/api/institutions/:id/sync` | — | `InstitutionSyncDTO`. Fetches from SimpleFIN and replaces the stored pending transactions and those in the fetched window, then deletes transactions older than 89 days. 404 unknown id; 409 `CONFLICT` if the last successful sync was under 15 minutes ago (or one is running); 502 `UPSTREAM_ERROR` when access was revoked, the subscription needs payment, SimpleFIN rate limits or is unavailable. `warnings` carries SimpleFIN's own notices (plain text). |
| DELETE | `/api/institutions/:id` | — | `204` / 404. Deletes the connection, its accounts and its stored transactions locally. SimpleFIN has no revoke API, so the token must be disabled in the user's SimpleFIN account. |
| PATCH | `/api/institutions/:id/accounts/:accountId` | `{ kind?, statementClosingDay?, paymentDueDay?, aprBasisPoints?, minimumPaymentRule?, minimumPaymentCents? }` | `BankAccountDTO` with updated fields. `minimumPaymentCents` is the real monthly minimum for the Debt payoff page, which lists `CREDIT` and `LOAN` accounts: a positive integer of cents (at most 1,000,000,000), or `null` to clear it and fall back to the planner's estimate (2% of the balance, $25.00 floor). `minimumPaymentRule` stays free text the planner ignores. Only `BANK` accounts are summed into the starting balance (`SettingsDTO.accountsBalanceCents` / `accountCount`), and the oldest of their recent balance dates is the projection start date with the `ACCOUNTS` source (`accountsBalanceDate`, `accountsStaleCount`). Syncs never change `kind` or card fields. 400 `VALIDATION_ERROR`; 404 for an unknown connection or an account that isn't part of it. |
| POST | `/api/institutions/:id/accounts/:accountId/card-bill` | `{ variableSpendCents? }` | Estimates and upserts a one-time bill for the card payment from the synced balance plus recurring charges before the closing date. Returns `{ accountId, closingDate, dueDate, projectedBillCents, minimumPaymentCents, billId }`. 400 if the account is not a credit card or its closing/due days are unset. |
| GET | `/api/institutions/:id/transactions` | `accountId` (required), `offset?` (default 0) | `BankTransactionsResponse` `{ transactions, hasMore }` from the local snapshot, limited to the last 89 days (counting today), newest first (date, then id), 50 per page. `amountCents` is signed. 400 `VALIDATION_ERROR` without `accountId`; 404 for an unknown connection or an account that isn't part of it. |

## Recurring-payment scan (from bank history)
Finds repeating payments and deposits in the stored bank transactions and suggests them as bills or income. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 12. The scan reads the local snapshot only and never calls SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/recurring` | — | `RecurringScanResponse` `{ suggestions, currency, connectionCount, transactionCount, lastSyncedAt }`. Each suggestion is a `RecurringSuggestionDTO`: `key`, `kind` (`INCOME` or `BILL`), `name`, `amountCents` (positive, latest occurrence), `frequency` (`WEEKLY`, `BIWEEKLY` or `MONTHLY`), `nextDate` (YYYY-MM-DD, first expected date on or after today), `occurrences`, `seenDates` and `amountVaries`. Suggestions already tracked as bills or income are left out. Only accounts labelled `BANK` are read, so `transactionCount` leaves out card, loan and other accounts. |

Adding a suggestion uses the existing `POST /api/bills` or `POST /api/income`, with the notes "Found in your bank history."

## Subscription audit (from bank history and the tracked bills)
The Subscriptions page. Detected recurring charges plus the bills the user already tracks. Reads the local snapshot only and never calls SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/subscriptions` | — | `SubscriptionAuditResponse` `{ suggestions, tracked, currency, connectionCount, transactionCount, lastSyncedAt }`. `suggestions` are the detected recurring charges (BILL kind only, income excluded), each a `RecurringSuggestionDTO`, with anything the user dismissed left out. `tracked` is the user's bills (any frequency; the view marks them "Tracked" or "Paused"). One-time bills appear in neither. |
| POST | `/api/subscriptions/dismiss` | `{ key }` (the suggestion `key`) | `204`. Marks the charge "not a subscription" so the audit stops showing it. 400 `VALIDATION_ERROR` without a `key`. |

## Bill payment matches (from bank history)
Synced bank transactions that look like the payment of a bill occurrence that is not yet marked paid. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 14. The endpoint reads the local database only, never calls SimpleFIN and changes nothing.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/bills/matches` | — | `BillMatchesResponse` `{ matches, currency }`. Each match is a `BillPaymentMatchDTO`: `billId`, `billName`, `dueDate` (the scheduled occurrence), `expectedCents` (the occurrence's override, else the bill amount), `amountOverrideCents` and `note` (the occurrence's recorded values, or `null`), and `transaction` `{ id, date, description, cents }` (`cents` is the positive magnitude of the money out). Sorted by `dueDate`, then bill name. `matches` is empty when no bank is connected. |

To accept a match, the client calls the existing `PUT /api/bills/:id/occurrences/:date` with `{ status: "PAID", amountOverrideCents, note }` copied from the match, so the override and note are kept. Marking paid is tracking only and never changes the projection.

## Bill estimate (from bank history)
A suggested amount for a variable bill, from the stored bank transactions. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 15. It reads the local snapshot only, never calls SimpleFIN, and **saves nothing**: to use a suggestion the client sends the normal `PUT /api/bills/:id/occurrences/:date` with `amountOverrideCents`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/bills/:id/estimate` | `date?` (YYYY-MM-DD, the occurrence being estimated; its month picks the season; default today) | `BillEstimateDTO` `{ estimate, reason, currency }`. `estimate` is `{ amountCents, method, periodCount, firstDate, lastDate }` or `null`. `amountCents` is a positive integer, `method` is `ROLLING` or `SEASONAL`, `periodCount` is how many weeks, 2-week periods or months it averages, and `firstDate`/`lastDate` bound the bank payments used. `reason` is `null` when there is an estimate, otherwise `NO_BANK_DATA`, `NO_MATCHES`, `TOO_FEW_PERIODS` or `UNSUPPORTED_FREQUENCY`. 404 for an unknown bill; 400 `VALIDATION_ERROR` for a malformed `date`. |

## Spend analyzer (from bank history)
Last month's and this month's spending by category. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 13. Both endpoints read and write the local database only and never call SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/spending` | — | `SpendingResponse` `{ thisMonth, lastMonth, lastMonthToDateCents, coverageStart, currency, connectionCount, transactionCount, lastSyncedAt }`. Each period is a `SpendingPeriodDTO`: `from`, `to`, `totalCents`, `transactionCount`, `transfersCents`, `categories`, `topMerchants` and `transactions` (every money-out transaction of the period, transfers included, newest first: `id`, `date`, `name`, `description`, `cents`, `category`, `source` (`AUTO`, `MERCHANT` or `MANUAL`) and `merchantLearnable`). Reads accounts labelled `BANK` or `CREDIT`; a bank debit that a credit account received is a transfer (`CONVENTIONS.md` section 13). |
| PUT | `/api/spending/transactions/:id/category` | `{ category, applyToMerchant? }` | The refreshed `SpendingResponse`. `category` is a `SpendingCategory` (including `TRANSFERS`) or `null` to go back to the automatic category. `applyToMerchant` defaults to `true`: the choice is remembered for the transaction's merchant, replacing any per-transaction choices for it; `false` changes only this transaction. 404 for a transaction that isn't a settled one in the 89-day history; 400 `BAD_REQUEST` for money in, or for `applyToMerchant` on a description with no merchant name (`merchantLearnable: false`); 400 `VALIDATION_ERROR` for an unknown category or extra fields. |

## Global search (Ctrl/Cmd+K)
Search across the app's own data for the command palette. Rules are in [`CONVENTIONS.md`](CONVENTIONS.md) section 20. It reads the local database only and never calls SimpleFIN.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/search` | `q` (required, trimmed, 1-100 characters), `limit?` (1-50, default 20, a cap **per group**) | `SearchResponse` `{ query, results }`. `results` is a flat list grouped by `kind` in the order `BILL`, `INCOME`, `TRANSACTION`, `GOAL`, `ACCOUNT`, best match first within a group. Each `SearchResultDTO` is `{ id, kind, title, subtitle, amountCents, currency, href }`: `amountCents` is signed for transactions (money in positive, money out negative), a positive magnitude for bills, income and goals, and `null` for accounts (`currency` is `null` with it); `href` is the app path to open. Bank transactions are limited to the stored 89-day history. 400 `VALIDATION_ERROR` on `q` when it is missing, blank or over 100 characters, and on `limit` when it is not a whole number from 1 to 50. |

## Data management (local only)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/data/export` | — | `200 DataExportDTO`, sent as a download: `Content-Type: application/json`, `Content-Disposition: attachment; filename="cashflow-planner-backup-<YYYY-MM-DD>.json"` (the server's local today) and `Cache-Control: no-store`. Body: `{ format: "cashflow-planner-export", formatVersion: 1, appVersion, exportedAt, settings, incomes, bills, billOccurrences, institutions }`. `settings` is the stored `SettingsDTO` (the typed balance and start date, plus the derived `accountsBalanceCents`, `accountCount`, `accountsBalanceDate` and `accountsStaleCount` as of the export), `billOccurrences` holds every recorded status row for every bill, and each institution is `{ id, name, connectedAt, lastSyncedAt, accounts: BankAccountDTO[], transactions: BankTransactionDTO[] }` with every stored transaction, newest first. The Zod schema is `dataExportSchema`. It **never** contains an Access URL, setup token, Authorization header or any other bank-connection field. Read only; changes nothing. |
| POST | `/api/data/restore` | Backup file JSON body from any app version (`formatVersion: 1`) | `200 { ok: true }`. Accepts only `format: "cashflow-planner-export"`, `formatVersion: 1`, and validates with `dataRestoreSchema`. A backup from before the desktop-notifications setting has no `desktopNotifications`; restoring it turns notifications on (the default). Derived settings fields and institutions may be missing or older-shaped because they are ignored. Malformed JSON and relationship/duplicate errors return `400 BAD_REQUEST`; schema failures return `400 VALIDATION_ERROR`. Orphan occurrences, duplicate income ids, duplicate bill ids, and duplicate `(billId, dueDate)` occurrences are rejected before writing. Atomically replaces income, bills, all recorded occurrences and the stored settings (typed settings fields only; derived account fields and `updatedAt` are ignored), preserving income/bill ids and `createdAt`. Bank connections, accounts, transactions, `TransactionCategory` and `MerchantCategoryRule` rows are kept as they are now. The backup's `institutions` are not imported. |
| POST | `/api/data/demo` | — | **Destructive.** `200 { ok: true }`. **Replaces** all income, bills and occurrences with clearly labeled demo data ("Demo: …" names), and sets the start date to today and the starting balance to $1,250.00. |
| POST | `/api/data/reset` | — | **Destructive.** `200 { ok: true }`. Deletes all income, bills and occurrences, deletes every bank connection with its stored accounts and transactions (locally only; SimpleFIN has no revoke call), and resets settings to defaults. |

The UI must confirm demo data, reset, and backup restore with the user first. The export needs no confirmation.
