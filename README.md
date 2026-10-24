# CashFlow Planner

A local, single-user personal cash-flow planner. It answers one question:

> **How much money will I have left each week after accounting for my income and all my upcoming bills?**

You enter a starting balance, your paychecks (weekly, biweekly or one-time) and your bills (one-time, weekly, biweekly, monthly, quarterly, yearly). CashFlow Planner projects your running balance day by day and week by week on a calendar, and explains every number with an event ledger.

- Runs entirely on your machine at **http://localhost:3000**. There are no accounts, no bank connections and no external services.
- Projections are estimates. They assume every scheduled paycheck arrives and every listed bill is paid on time.

## Features

- **Calendar (main screen):** month and week views. Every week shows the opening balance, income, bills, net change and **projected closing balance**. Every day shows its paychecks and bills, and the end-of-day balance. Select a week to see the ordered breakdown with the running balance after each event. Select an event to mark a bill occurrence paid or skipped, override this occurrence's amount, or edit the underlying bill or income.
- **Dashboard:** starting balance, next paycheck, projected end of this week and next week, lowest projected balance, totals, a negative-balance warning, upcoming bills and a balance trend chart.
- **Income & Bills:** create, edit, delete and deactivate, with optional end dates, categories and notes.
- **Settings:** starting balance, projection start date, currency, forecast length (7–366 days), week start day and default calendar view. Also load demo data or clear everything.

## Prerequisites

- **Node.js 20.9 or newer** (developed with Node 22 LTS) and npm.
- No database server is needed. SQLite is stored in a file at `prisma/dev.db`.

> **This machine:** the system Node is v12, which is too old, so a portable Node 22 is kept in `.tools/node` (git-ignored). Put it first on your PATH in each PowerShell window before running any command below:
> ```powershell
> $env:Path = "$PWD\.tools\node;$env:Path"
> node --version   # v22.x
> ```

## Setup

```bash
npm install                 # installs dependencies and generates the Prisma client
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run db:deploy           # creates prisma/dev.db and applies migrations
npm run db:seed             # OPTIONAL: loads clearly labeled demo data ("Demo: …")
```

To start with a clean database, skip the seed step. You can also clear everything later from **Settings → Data**, or with `npm run db:reset`.

## Run

```bash
npm run dev      # development server on http://localhost:3000
# or
npm run build
npm start        # production server on http://localhost:3000
```

The app only runs on port 3000. If the port is busy, `npm run dev` and `npm start` stop with a clear message instead of switching to another port.

## Desktop app (Windows)

```bash
npm run desktop:dist     # builds dist-desktop/CashFlow Planner Setup <version>.exe (NSIS installer)
npm run desktop:start    # builds and runs the desktop app from source (data: %APPDATA%\CashFlow Planner (dev))
```

The installer adds Start menu and desktop shortcuts. The app opens in its own window and runs the Next.js server inside Electron's main process, on `127.0.0.1` at a random free port, so it never conflicts with `npm run dev`. Closing the window quits the app and frees the port. Data lives in `%APPDATA%\CashFlow Planner\cashflow.db`, which is created and migrated on first launch (applied migrations are tracked in `_app_migrations`). The installer is unsigned, so Windows SmartScreen asks once: **More info → Run anyway**.

On pushes to `main`, the workflow publishes the Windows NSIS installer as a GitHub Release tagged `v<package.json version>`, unless that tag or release already exists. `workflow_dispatch` can rerun it manually. The setup filename includes the app version.

> If `ELECTRON_RUN_AS_NODE=1` is set in your shell (some IDE terminals set it), the exe silently runs as plain Node. Run `Remove-Item Env:ELECTRON_RUN_AS_NODE` first.

## Test & quality checks

```bash
npm run typecheck          # TypeScript
npm run lint               # ESLint
npm run test:unit          # projection engine, recurrence, dates, money
npm run test:integration   # API route handlers against a separate test SQLite DB
npm test                   # all Vitest suites (unit + integration + component)
npx playwright install chromium   # once, to download the E2E browser
npm run test:e2e           # Playwright end-to-end (reuses or starts the server on :3000; resets app data)
```

Integration tests use their own database file and never touch `prisma/dev.db`. E2E tests drive the real app and **reset the data in `prisma/dev.db`**, so run them against a dev database you don't mind losing.

## How projections work (key assumptions)

The full rules are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). In short:

- **Money** is stored and calculated as integer cents. Floating-point is never used for money.
- **Starting balance** is your balance at the start of the projection start date, *before* any paycheck or bill dated that day. Events on the start date are included.
- **Forecast window** runs from the start date for `forecastDays` days (default 90). The calendar can browse up to 12 months past the start date. Nothing before the start date affects balances.
- **Recurrence is anchored** to the date you enter. Weekly is every 7 days and biweekly every 14 days from the first payday; biweekly pay is never split into weekly amounts. Monthly, quarterly and yearly keep the original day of the month. When a month is too short, they use its last day (Jan 31 → Feb 28/29 → Mar 31). End dates are inclusive.
- **Same-day order:** income first, then bills, each alphabetically. Daily and weekly totals don't depend on this order. The "lowest balance" uses end-of-day balances.
- **Weeks** start on Sunday by default (Monday is available). The first week may be partial. Each week's opening balance equals the previous week's closing balance.
- **Paid vs. skipped:**
  - Marking an occurrence **paid** is tracking only. It is still counted exactly once on its due date, never twice.
  - **Skipped** occurrences don't count at all, and later occurrences are unaffected.
  - Per-occurrence amount overrides support variable bills.
  - Editing a bill never rewrites past paid or skipped records.
- To line projections up with your real bank balance, update the starting balance and start date in Settings.

## Architecture

```
src/
  contracts/api.ts      Zod schemas + typed API contract shared by server, UI and tests
  domain/               Pure, deterministic engine (no I/O): money, dates, recurrence, projection, dashboard
  server/               Prisma client, repositories (scoped by householdId), error helpers, demo data
  app/api/              Next.js route handlers (REST API, see docs/API.md)
  app/                  Pages: / (dashboard), /calendar, /bills, /income, /settings
  components/, lib/     UI components and typed API client
prisma/                 schema.prisma, migrations, seed.ts
tests/                  unit, integration, component, e2e
docs/                   CONVENTIONS.md (financial rules), API.md (endpoints)
```

The UI never calculates balances itself. It renders what the projection engine returns through `/api/projection` and `/api/dashboard`, so every view shows the same numbers.

## Privacy

All data lives in `prisma/dev.db` on this computer. The app makes no external network calls, and Next.js telemetry is disabled through `NEXT_TELEMETRY_DISABLED=1` in `.env`.

## Known dependency advisories

`npm audit` reports a high-severity advisory in `deepmerge-ts`, which is pulled in by Prisma 6's dev-time config loader. The only fix is the breaking Prisma 7 upgrade. The issue requires merging attacker-controlled recursive objects into Prisma config, which doesn't happen in this local app, so it is accepted for now. PostCSS is pinned to a patched version through `overrides` in `package.json`.
