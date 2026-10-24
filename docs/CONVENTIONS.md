# CashFlow Planner — Financial & Engineering Conventions

These rules are the team agreement. The projection engine (`src/domain/`) implements them, the API exposes them, the UI only *displays* their results, and the tests verify them. If you need to change a rule, update this file and tell the other team members.

## 1. Money

- All amounts are **integer cents** (`amountCents`, `balanceCents`). Floats are never used for money arithmetic anywhere: not in the engine, the API, the DB, or the UI.
- The UI converts user input to cents with string parsing (`"12.99"` → `1299`), not `parseFloat(x) * 100`. Formatting uses `Intl.NumberFormat` with the settings currency.
- Bill and income amounts are **positive magnitudes**. The sign comes from the event kind (income `+`, bill `−`).
- Amount limits: `1 ≤ amountCents ≤ 1,000,000,000` ($10M). The starting balance may be zero or negative.
- Currency is display-only (default `USD`). There is no FX conversion. Because amounts are stored in hundredths, the UI offers only currencies with 2 minor-unit digits (zero-decimal currencies such as JPY are not offered).

## 2. Dates

- Calendar dates are **`YYYY-MM-DD` strings** with no time and no timezone. Date math uses UTC-based helpers (`src/domain/dates.ts`) so DST and local timezones can never shift a date.
- "Today" is the server machine's local date (`YYYY-MM-DD`).
- Date ranges are **inclusive** at both ends (`endDate`, `from`/`to`, week ranges).

## 3. Projection window & opening balance

- `startingBalanceCents` is the balance at the **start of `projectionStartDate`, before any event on that date**. Events dated on the start date **are** applied.
- Window = `[projectionStartDate, projectionStartDate + forecastDays − 1]`. `forecastDays` defaults to 90, ranges 7–366, and the UI offers presets up to 12 months.
- `maxEndDate = projectionStartDate + 365 days`. Requests for `to` beyond the window are honored up to `maxEndDate` so a calendar can browse up to 12 months ahead. Requests before `projectionStartDate` are clamped to it, because no balance is known before the start date.
- Events before `projectionStartDate` or after the computed end are **ignored**. They never affect any balance.
- The engine always computes **from `projectionStartDate` forward** and then slices the requested range. Every view therefore sees identical balances, and changing the range or view can never duplicate or drop events.

## 4. Recurrence (anchored, no drift)

The anchor is the configured first/next date (`anchorDate`). Occurrence *k* (k = 0, 1, 2, …) is always computed **from the anchor**, never from the previous occurrence.

| Frequency | Occurrence k |
|---|---|
| `ONE_TIME` | anchor only (k = 0). `endDate` ignored. Never recurs. |
| `WEEKLY` | anchor + 7k days |
| `BIWEEKLY` | anchor + 14k days |
| `MONTHLY` | (anchor month + k) on day `min(anchorDay, daysInMonth)` |
| `QUARTERLY` | (anchor month + 3k) on day `min(anchorDay, daysInMonth)` |
| `YEARLY` | (anchor month + 12k) on day `min(anchorDay, daysInMonth)` |

- **Month-end policy:** if the anchor day doesn't exist in a month, use the **last day of that month**. The anchor day is preserved for later months: Jan 31 → Feb 28 (Feb 29 in leap years) → Mar 31 → Apr 30. This avoids drift. Yearly Feb 29 → Feb 28 in non-leap years, Feb 29 in leap years.
- No occurrences before the anchor. `endDate` is inclusive. Occurrences after `endDate` are not generated.
- **Inactive** income or bills generate nothing.
- Income uses the actual payday. Biweekly pay is **never** split into weekly amounts.

## 5. Occurrence status (bills)

A `BillOccurrence` row, keyed by `(billId, dueDate)`, records the user's status for one scheduled occurrence. No row means `UPCOMING` at the bill's default amount.

| Status | Effect on projection |
|---|---|
| `UPCOMING` | Counted once on its due date. |
| `PAID` | **Counted once on its due date, exactly like UPCOMING.** The status is tracking only. Marking a bill paid never creates a second expense and never removes the original one. (The projection models money leaving the account on the scheduled date. To reflect a real bank balance, update the starting balance and start date.) |
| `SKIPPED` | **Not counted.** It appears in the ledger with `included: false` and `signedAmountCents: 0` for transparency. Future occurrences are unaffected. |

- `amountOverrideCents` (variable bills) replaces the default amount for that one occurrence only.
- Status is tracking data, separate from the bill definition. Editing a bill (amount, date, frequency) **never rewrites or deletes** occurrence rows. If the schedule moves, old rows simply stop matching a generated date and are kept as history. Deleting a bill cascades and deletes its occurrence rows.
- The API rejects a status update for a date that isn't a scheduled occurrence of that bill (`400 BAD_REQUEST`).

## 6. Ordering within a day

The ledger is sorted by:
1. `date` ascending
2. kind: **income before bills** (paychecks are assumed to land before bills are drafted that day)
3. `name` ascending (case-insensitive, then exact)
4. `sourceId` ascending (a deterministic tiebreak)

`sequence` is the 0-based position in that global order. `balanceAfterCents` is the running balance after each event. Skipped events carry the unchanged balance.

## 7. Days, weeks, totals

- **Day:** `opening` = previous day's closing (or the starting balance on the start date). `closing = opening + income − bills`.
- **Week:** starts on `weekStartsOn` (0 = Sunday, the default; 1 = Monday). The first week is the one containing `projectionStartDate` and may be **partial** (`rangeStart > weekStart`). Its opening is the starting balance. Each subsequent week's opening **equals** the previous week's closing. `closing = opening + income − bills`.
- **Lowest balance** = minimum **end-of-day** balance (including the opening balance) over the period. Using end-of-day balances makes it independent of intra-day ordering.
- **Reconciliation invariants** (tested):
  - `week.closing = week.opening + week.income − week.bills`
  - `weeks[i+1].opening = weeks[i].closing`
  - `opening + Σ(signedAmountCents of events in range) = closing` for every day, week and the whole range
  - the event ids in weeks and days partition the event list exactly (no duplicates, no omissions)

## 8. Dashboard reference date

`referenceDate = max(today, projectionStartDate)`, clamped to the window end. "Current week" is the week containing the reference date, and "next week" is the one after it. The next paycheck is the first income event on or after the reference date. Upcoming bills are non-skipped bill events in `[referenceDate, referenceDate + 13]`, up to 8 of them.

## 9. Engineering rules

- One calculation engine: `src/domain/projection.ts`. The UI **never** recomputes balances. It renders `ProjectionResponse` and `DashboardResponse`.
- The domain modules (`src/domain/*`) are pure functions. They have no Prisma, no `Date.now()` (today is passed in) and no I/O.
- All input is validated with the Zod schemas in `src/contracts/api.ts`, shared by server and client.
- Errors use the `ApiErrorBody` shape: `{ error: { code, message, fieldErrors? } }`.
- The data access layer is scoped by `householdId` (always `"local"` in the MVP).
- There are no analytics and no external services except the optional **SimpleFIN Bridge** bank connection (see *SimpleFIN (bank connections)* below). Any other provider must be documented here first; credentials stay server-side and are never exposed to the browser.
- **Only src/server/simplefin.ts touches setup tokens and Access URLs.** It never logs them, never puts them (or the Authorization header) in an error message, and no DTO or API response ever contains an Access URL. Pure parsing lives in src/server/simplefin-mapping.ts (no I/O). Tests mock etch or the module and never call the network.
- The app runs on port **3000** only. `scripts/check-port.mjs` fails loudly if the port is taken.

### SimpleFIN (bank connections)

SimpleFIN Bridge is the only bank-connection provider. It is read-only, paid by the user directly to SimpleFIN, and optional.

- **Setup token and Access URL.** The user pastes a *setup token* (base64 of a claim URL). The server decodes it and POSTs to the claim URL once; the response body is the *Access URL* (`https://user:password@host/simplefin`), which is stored in `BankConnection.accessUrl` (unencrypted, like the rest of the data) and used only by `simplefin.ts`. The claim URL comes from user input, so it is POSTed to only if it is `https` on `simplefin.org` or a subdomain (not `evilsimplefin.org`, not `simplefin.org.evil.com`, no credentials or port); anything else is a `400` before any network call. The returned Access URL is validated by the same host rule and must carry credentials. `fetch` rejects credentials in URLs, so requests strip them and send `Authorization: Basic base64(user:pass)`, with redirects disabled and a 20 second timeout.
- **Amounts** are decimal strings converted to integer cents by **string parsing**, never floats (`"-12.34"` becomes `-1234`, `"12.3"` becomes `1230`). More than two decimals round half away from zero. Values outside the signed 32-bit range are treated as unreadable.
- **Sign convention: money in is positive, money out is negative**, exactly as SimpleFIN reports it (`BankTransaction.amountCents`). This is the opposite of bills, which are positive magnitudes whose sign comes from their kind. The UI shows the sign and an arrow, not color alone.
- **Dates:** SimpleFIN timestamps are epoch seconds; they become the **UTC calendar date** (`YYYY-MM-DD`) of that instant. A transaction with no `posted` time (pending) uses `transacted_at`, else the sync date (the server's local today, passed in). A missing balance date uses the sync date.
- **Currency:** stored as given when it is a 3-letter code; a non-ISO value (SimpleFIN allows a URL) is stored as `USD`. Display only, no conversion.
- **Stored snapshot, explicit sync.** SimpleFIN allows **24 requests per day** (abuse gets the token disabled) and refreshes bank data about once a day. The app therefore never fetches while a page is viewed: it fetches on *connect* and on the user's *Refresh*. A refresh needs **at least 15 minutes** since the last successful sync (`409 CONFLICT` otherwise); `lastSyncedAt` moves only after a successful fetch.
- **Window:** each request covers at most 90 days. The first sync fetches the last ~90 days; later syncs start 7 days before `lastSyncedAt` (late-posting items), never earlier than the cap, floored to a UTC midnight; `end-date` (exclusive) is now plus one day.
- **History window:** only the last **89 days, counting today** (dates >= today - 88 days, HISTORY_DAYS / historyCutoff in simplefin-mapping.ts) are shown or kept. The transactions endpoint filters by it, so rows age out of view even without a sync, and every sync deletes older rows. SimpleFIN returns at most 90 days per request anyway, so there is no backfill.
- **Replace-in-window:** in one database transaction, accounts are upserted and, per account, all stored *pending* transactions and all non-pending ones dated inside the fetched window are deleted and replaced by the fetched rows (no duplicates, stale pending rows disappear). After each sync, transactions older than the history window (below) are deleted. An account that SimpleFIN reports an error for keeps its stored transactions.
- **Warnings** (`errlist` messages, or the deprecated `errors` strings) are plain display text, rendered as text only. If the claim succeeds but the first sync fails, the connection is kept (a token can't be claimed twice) and the failure is returned as a warning.
- Removing a connection is local only (SimpleFIN has no revoke API); the UI tells the user to disable the token in their SimpleFIN account.

## 10. Domain module API (pure, unit-testable)

Tests are written against these exact signatures. If one changes, update this section and notify QA and frontend.

```ts
// src/domain/money.ts (exists): parseMoneyToCents, centsToDecimalString, centsToInputValue, formatCents, sumCents

// src/domain/dates.ts
addDays(date: string, days: number): string
addMonthsClamped(anchor: string, months: number): string   // day = min(anchorDay, daysInMonth)
daysInMonth(year: number, month1to12: number): number
diffDays(from: string, to: string): number                   // to - from, in days
startOfWeek(date: string, weekStartsOn: number): string
eachDay(from: string, to: string): string[]                  // inclusive
todayLocal(now?: Date): string                               // machine-local YYYY-MM-DD
minDate(a: string, b: string): string; maxDate(a: string, b: string): string

// src/domain/recurrence.ts
interface Schedule { frequency: IncomeFrequency | BillFrequency; anchorDate: string; endDate: string | null }
generateOccurrences(schedule: Schedule, from: string, to: string): string[]   // ascending, inclusive window
isScheduledOn(schedule: Schedule, date: string): boolean

// src/domain/projection.ts
interface ProjectionInput {
  settings: Pick<SettingsDTO, "startingBalanceCents" | "projectionStartDate" | "forecastDays" | "weekStartsOn" | "currency">;
  incomes: Pick<IncomeDTO, "id" | "name" | "amountCents" | "frequency" | "anchorDate" | "endDate" | "active">[];
  bills: Pick<BillDTO, "id" | "name" | "amountCents" | "frequency" | "anchorDate" | "endDate" | "active" | "category">[];
  occurrences: Pick<BillOccurrenceDTO, "billId" | "dueDate" | "status" | "amountOverrideCents">[];
  from?: string; to?: string;
}
computeProjection(input: ProjectionInput): ProjectionResponse

// src/domain/dashboard.ts
buildDashboard(input: Omit<ProjectionInput, "from" | "to" | "settings"> & { settings: SettingsDTO; today: string }): DashboardResponse

// src/domain/recurring.ts (section 12)
detectRecurring(input: { transactions: { date; description; amountCents }[]; incomes: ExistingSchedule[]; bills: ExistingSchedule[]; today: string }): RecurringSuggestionDTO[]
// ExistingSchedule = { name; amountCents; frequency; anchorDate; endDate }
```

## 11. Team workflow rules

- Node.js **24 LTS** is the project standard. Use the version pinned in `.nvmrc` (currently **24.22.1**) for development, tests, builds and CI; `package.json` permits newer Node 24 releases but excludes other major versions. Keep `.nvmrc` current with Node 24 LTS patch releases. npm enforces this requirement through `.npmrc`.
- Select that runtime before every shell command. With nvm, run `nvm install` and `nvm use` from the repository root. For portable Node on Windows, install the pinned release in `.tools/node` and prepend it: `$env:Path = "$PWD\.tools\node;$env:Path"`. On macOS/Linux with a portable distribution there, use `export PATH="$PWD/.tools/node/bin:$PATH"`. Verify with `node --version`.
- **One shared dev server** runs at http://localhost:3000 (started by the lead; it hot-reloads). Do not start another `next dev` or `next build`, because they share `.next/` and corrupt each other. Only the lead runs `next build`.
- Do not edit `package.json` or install packages. Ask the lead.
- Prisma schema changes require stopping the dev server on Windows (the engine DLL is locked). Ask the lead.

## 12. Recurring-payment scan

Finds repeating payments and deposits in the stored bank history (section 9, SimpleFIN) and suggests them as bills or income. Pure rules in `src/domain/recurring.ts`. The scan reads the local snapshot only and **never calls SimpleFIN**.

- **Input:** settled (non-pending) transactions in the 89-day history window.
- **Grouping:** by direction (money in = income, money out = bill) and a normalised merchant name. Reference numbers and bank boilerplate (`POS`, `DEBIT`, `ACH`, …) are dropped; the first 3 words form the key. Several charges on the same day are one sighting, with amounts summed.
- **Cadences:**

| Frequency | Gap between sightings | Min. sightings | Amount tolerance (vs. median) | Stopped if last sighting is older than |
|---|---|---|---|---|
| `WEEKLY` | 6–8 days | 3 | 15% | 14 days |
| `BIWEEKLY` | 13–15 days | 3 | 15% | 28 days |
| `MONTHLY` | 26–35 days | 2 | 10% (2 sightings), 40% (3+) | 45 days |

- Quarterly and yearly payments are **not detectable**: they don't repeat inside 89 days.
- **Amount:** the latest occurrence. `amountVaries` is true when amounts differ by more than 2% of the median.
- **Next date:** the first expected date on or after today. Weekly and biweekly step 7 or 14 days from the last sighting. Monthly uses the usual day of month; a clamped month-end does not override a 31st (section 4).
- **Already tracked (hidden):** an existing bill or income of the same kind that is not one-time and not ended (paused counts) when any of these hold:
  1. one name's words (ignoring bank boilerplate) are all in the other name;
  2. same first word (5+ letters) and amount within 25%;
  3. same frequency, amount within 3%, and a scheduled date within 3 days (monthly) or 1 day (weekly, biweekly) of the suggested next date.
- **Order:** next date, then income before bills, then name.
- **Skip is per scan.** Nothing is stored, so skipped suggestions reappear on the next scan.
- **Adding** a suggestion uses the normal `POST /api/bills` or `POST /api/income`, with the notes "Found in your bank history."
