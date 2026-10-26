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
- **Starting balance source** (`startingBalanceSource`, default `MANUAL`): with `MANUAL` the typed `startingBalanceCents` is used. With `ACCOUNTS` the starting balance is the **sum of `balanceCents` over the connected accounts labelled `BANK`** (section 9, SimpleFIN), as of the last sync. Each account carries a user label, `kind`: `BANK`, `CREDIT`, `LOAN` or `OTHER`; only `BANK` accounts are summed, so a credit card or line of credit never lowers the starting balance. The label is changed on the Institutions page (`PATCH /api/institutions/:id/accounts/:accountId`) and a sync never overwrites it. An account the app has not seen before gets a first guess from its name (`guessAccountKind`: "credit card", "line of credit", "HELOC" give `CREDIT`; "loan", "mortgage" give `LOAN`; anything else `BANK`); accounts that existed before labels were introduced are `BANK`. The sum is computed server-side when settings are loaded (`effectiveStartingBalanceCents`), so the engine and every view see one value. The typed balance is kept, never overwritten, and is used while no account is labelled `BANK` (`accountsBalanceCents: null`). Accounts are summed as stored, with no currency conversion. The sum moves only when the user refreshes a bank or relabels an account, so the start date should be today.
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
- **Only src/server/simplefin.ts touches setup tokens and Access URLs.** It never logs them, never puts them (or the Authorization header) in an error message, and no DTO or API response ever contains an Access URL. Pure parsing lives in src/server/simplefin-mapping.ts (no I/O). Tests mock fetch or the module and never call the network.
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

The domain modules are the contract that the tests are written against. Their exported signatures are the source of truth, so this file does not repeat them: read the module.

| Module | Owns |
|---|---|
| `src/domain/money.ts` | parsing input to cents, formatting cents, summing |
| `src/domain/dates.ts` | `YYYY-MM-DD` arithmetic (add days or clamped months, diff, week start, clamp, machine-local today) |
| `src/domain/recurrence.ts` | `Schedule` and anchored occurrence generation (section 4) |
| `src/domain/projection.ts` | window and range resolution, `computeProjection`, same-day ordering (sections 3, 6, 7) |
| `src/domain/dashboard.ts` | `buildDashboard` (section 8) |
| `src/domain/starting-balance.ts` | `effectiveStartingBalanceCents` (section 3) |
| `src/domain/account-kind.ts` | `guessAccountKind`, the first label for a new bank account (section 3) |
| `src/domain/recurring.ts` | `detectRecurring` and merchant-name normalisation (section 12) |
| `src/domain/spending.ts` | `categorize`, `merchantKey` and `buildSpending` (section 13) |

Rules for every module: pure functions, no Prisma, no I/O, no `Date.now()` (today is passed in). ESLint enforces this (`eslint.config.mjs`, the `src/domain` block), and bans `parseFloat` across `src/` because money is parsed from strings. If you change an exported signature, update its callers and tests in the same PR and mention it in the PR description.

## 11. Team workflow rules

- Node.js **24 LTS** is the project standard. Use the version pinned in `.nvmrc` (currently **24.22.1**); `package.json` permits newer Node 24 releases but excludes other major versions, and npm enforces this through `.npmrc`. Keep `.nvmrc` current with Node 24 LTS patch releases. With nvm, run `nvm install` and `nvm use` from the repository root. With a portable Node in `.tools/node` (git-ignored), put it first on `PATH` (`$env:Path = "$PWD\.tools\node;$env:Path"` in PowerShell, `export PATH="$PWD/.tools/node/bin:$PATH"` on macOS/Linux). Verify with `node --version`.
- **Port 3000 only.** `scripts/check-port.mjs` fails loudly if the port is taken. Do not start a second `next dev` on 3000, and do not run `next build` in a checkout where a dev server is running (they share `.next/`). Worktrees have their own `.next/` and their own `prisma/dev.db`.
- **Protecting data.** Real data lives in the main checkout's `prisma/dev.db` and the desktop app's `cashflow.db`. Never run `db:reset`, `prisma migrate reset`, `prisma db push` or `prisma migrate dev` against either. Apply migrations with `npm run db:deploy`. The E2E suite resets the database behind port 3000 and requires `E2E_ALLOW_DATA_RESET=1`; run it only against a server you started from your branch.
- **Migrations** are forward-only, additive and hand-reviewed SQL files. Create with `prisma migrate dev --create-only`, read the SQL, apply with `db:deploy`. Never edit a shipped migration. Dropping a table or column needs a data copy in the same migration and a note in the PR. The desktop app applies pending migrations on launch after backing up `cashflow.db` (`<userData>/backups/`). On Windows, schema changes need the dev server stopped (the engine DLL is locked).
- **Dependencies.** Anyone may add a package with `npm install <pkg>` (the lockfile updates with it). Prefer releases at least two weeks old, run `npm audit`, keep the app offline-capable (no runtime network calls or telemetry beyond SimpleFIN), and justify the package in the PR.
- **Version and commits.** Conventional Commits: `fix` → patch release, `feat` → minor release, `!`/`BREAKING CHANGE` → minor while 0.x; other types release nothing. Don't edit the version by hand. Release-please opens a Release PR; merging it publishes the release. See [AGENTS.md](../AGENTS.md).
- **Checks.** `npm run typecheck`, `npm run lint` and `npm test` must pass before a PR is opened. CI runs the same on every PR.

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

## 13. Spend analyzer

Shows where money went last month and so far this month, grouped by category. Pure rules in `src/domain/spending.ts`. It reads the local bank snapshot only and **never calls SimpleFIN**.

- **Input:** settled (non-pending) transactions in the 89-day history window. That window always covers last month and this month, because last month's first day is at most about 61 days back. The page shows the earliest transaction date (`coverageStart`) so a newly connected bank with thin history isn't mistaken for low spending.
- **What counts as spending:** money out only (`amountCents < 0`), counted as a positive magnitude. Money in (income, refunds) is ignored and refunds are **not** netted against purchases.
- **Periods** are calendar months by the transaction's `YYYY-MM-DD` date (section 9 dates). *This month* runs from the 1st through today; *last month* is the whole previous month. `lastMonthToDateCents` is last month's spending from the 1st through today's day number (clamped to that month's length, so on Mar 30 it covers Feb 1-28/29), for a like-for-like comparison.
- **Categories** (`SPENDING_CATEGORIES`): Groceries, Dining, Gas, Utilities, Bills, Shopping, Transport, Entertainment, Health, Transfers, Other. A transaction gets the **first** category whose keyword list matches the lower-cased description, tried in a fixed priority order so overlaps are deterministic (a gas station is Gas, not Shopping). Nothing matching is `OTHER`. Keyword matching is whole-word or word-prefix on tokens, never an arbitrary substring.
- **Transfers** (payments to a card, transfers between accounts, peer-to-peer apps, cash withdrawals) are summed separately in `transfersCents` and are **excluded** from `totalCents`, `categories` and `topMerchants`, so moving money around doesn't look like spending. The UI still shows Transfers as a row in "By category", sorted in by amount and marked "not in total", so a large card payment is visible; it has no percentage and the bar is grey.
- **Merchants:** transactions are grouped by the same normalised name used by the recurring scan (section 12); the top 5 by total are returned per period. Bank prefixes that only say how a purchase was made (`POS`, `DDA PUR AP`, …) are dropped from the name; otherwise they would put every purchase in one merchant.
- **The user's choices.** A transaction's category is the first of: (1) the user's choice for that transaction (`TransactionCategory`, `source: MANUAL`), (2) the category the analyzer learned for its merchant (`MerchantCategoryRule`, `source: MERCHANT`), (3) the keyword match (`source: AUTO`). Any category, `TRANSFERS` included, can be chosen, so a misread transfer can be counted as spending and the other way round. Only money out can be categorized.
- **Learning.** Changing a category in the UI remembers it for the merchant by default (`applyToMerchant`). The merchant key is the first 3 words of the normalised name (`merchantKey` in `src/domain/spending.ts`, the same words the merchant list groups by), so "KROGER #1234" and "POS DEBIT KROGER 5678" are one merchant. The rule applies to every transaction with that key, in history and in later syncs, and the **latest choice wins**. Setting a merchant rule deletes the per-transaction choices for that merchant. A null category undoes a choice the same way, back to automatic. A description with no usable name has an empty key and can only be changed one transaction at a time.
- **Storage.** Choices live in two tables, not on `BankTransaction`, because a sync deletes and re-inserts transactions with the same id. `TransactionCategory` keeps the transaction's date and its rows are pruned when it leaves the 89-day history window; merchant rules are kept until reset. Stored categories that are no longer in `SPENDING_CATEGORIES` are ignored. Everything else is derived on every request, so improving the keyword lists re-categorizes whatever the user hasn't decided. "Reset all data" deletes both tables; the JSON backup does not include them yet.
