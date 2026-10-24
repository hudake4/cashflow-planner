# Desktop App Plan — CashFlow Planner as a Windows .exe

**Status:** agreed, not started. Planned for 2026-10-24 (morning).
**Decision:** Option 1, an Electron desktop app with a real installer (`CashFlow Planner Setup.exe`), keeping the internal Next.js server *hidden inside the app process*. The server-less IPC rewrite was considered and not chosen.

## Requirements agreed with the user

1. Installs to the Start menu and desktop, and opens in its own window (no browser).
2. **Closing the window quits the app and shuts down the internal server and port.** There is no minimize-to-tray.
3. The server runs **inside Electron's main process** (it loads the Next standalone server in-process; no child process), so it can never outlive the app, even after a crash or force-quit.
4. It listens on **`127.0.0.1` only**, on a **random free port** (not 3000), so other devices can't reach it and it doesn't clash with `npm run dev`.
5. The database lives at **`%APPDATA%\CashFlow Planner\cashflow.db`** (Program Files isn't writable). It is created and migrated automatically on first launch.
6. The existing dev workflow (`npm run dev` on :3000) and all existing tests keep working.

## Implementation steps

| # | Step | Estimate |
|---|---|---|
| 1 | `next.config.ts`: `output: "standalone"`. Build and confirm `.next/standalone/server.js` runs. | |
| 2 | `electron/main.ts`: pick a free port, set `PORT`, `HOSTNAME=127.0.0.1`, and `DATABASE_URL=file:<userData>/cashflow.db`, `require()` the standalone server in-process, wait for it to be ready, then open a `BrowserWindow` at that URL. Single-instance lock. `window-all-closed` → `app.quit()`. Block external navigation and new windows. | ~15–20 min |
| 3 | Clean shutdown on quit (close the server, disconnect Prisma). | ~5 min |
| 4 | First-launch DB setup: the Prisma CLI is **not** shipped, so apply the bundled `prisma/migrations/*/migration.sql` files through the Prisma client and keep track of which have been applied (e.g. a small `_app_migrations` table). | ~10–15 min |
| 5 | electron-builder (NSIS installer): include the standalone output, `.next/static` and `public`. Put the Prisma query engine (`*.node`) and the `.prisma/client` folder in `asarUnpack`, and point Prisma at the unpacked engine if needed. Set `binaryTargets` in `schema.prisma` if required. App name "CashFlow Planner", with a generated simple icon. | ~15–30 min |
| 6 | Install packages (`electron`, `electron-builder`, ~150 MB of downloads) and build the installer. Pin versions released at least 2 weeks ago, and check `npm audit`. | ~5–10 min |
| 7 | Verify: install, launch, add data, close, and confirm with `Get-NetTCPConnection -State Listen` that **no port is left open** and no processes remain in Task Manager. Relaunch and confirm the data persisted. Re-run lint, typecheck, vitest and E2E against dev. | ~10–15 min |

**Total estimate:** ~1–1.5 hours, or up to about 2 hours if the risks below hit.

## Known risks

- Prisma's engine not loading inside the packaged app (the asar unpack path).
- Next's standalone `server.js` needing adjustments to run in-process under Electron (it expects to be the process entry point; you may need to call `next`'s `startServer` directly or adapt its env and cwd handling).
- Windows antivirus or file locks during builds, which can force rebuilds.

## Out of scope

- Code signing (needs a paid certificate). The user will see SmartScreen's "More info → Run anyway" once.
- A custom-designed icon (a simple generated one is fine).
- Auto-updates (rebuild and reinstall instead).

## Environment reminders

- The system Node is v12. Always prepend the portable Node 22: `$env:Path = "F:\Claude App Projects\cashflow-planner\.tools\node;$env:Path"`.
- Current baseline (2026-10-23): lint ✔, typecheck ✔, vitest 199/199 ✔, build ✔, Playwright E2E 4/4 ✔.
- Do this directly in the main session. It is one connected piece of work, so no agent team is needed.
