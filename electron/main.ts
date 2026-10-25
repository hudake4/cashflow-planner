/**
 * CashFlow Planner desktop entry point.
 *  - One instance only; a second launch focuses the existing window.
 *  - Closing the window quits the app, which stops the in-process server (see server.ts).
 *  - The window can only show the local app: external navigation and new windows are blocked.
 *    The one exception: links to SimpleFIN Bridge (to create a setup token) open in the user's browser.
 */
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, safeStorage, session, shell } from "electron";
import { DatabaseBackupError } from "./backup";
import { startServer, type RunningServer } from "./server";

const APP_NAME = "CashFlow Planner";

// Packaged: %APPDATA%\CashFlow Planner. Unpackaged (npm run desktop:start) gets its own folder
// so trying the desktop build from source never touches the installed app's data.
app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), app.isPackaged ? APP_NAME : `${APP_NAME} (dev)`));

const paths = app.isPackaged
  ? {
      serverDir: path.join(process.resourcesPath, "server"),
      migrationsDir: path.join(process.resourcesPath, "migrations"),
    }
  : {
      serverDir: path.join(app.getAppPath(), ".next", "standalone"),
      migrationsDir: path.join(app.getAppPath(), "prisma", "migrations"),
    };

let server: RunningServer | null = null;
let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("window-all-closed", () => app.quit());

  // Stop the server and close the database before the process exits.
  let stopped = false;
  app.on("will-quit", (event) => {
    if (stopped || !server) return;
    event.preventDefault();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    void Promise.race([server.stop(), timeout]).finally(() => {
      stopped = true;
      server = null;
      app.quit();
    });
  });

  app.whenReady().then(launch).catch((err: unknown) => {
    // A failed backup has a message written for the user; anything else shows its stack.
    const detail = err instanceof DatabaseBackupError ? err.message : err instanceof Error ? err.stack ?? err.message : String(err);
    dialog.showErrorBox(`${APP_NAME} could not start`, detail);
    app.exit(1);
  });
}

/** True only for https://bridge.simplefin.org and https://beta-bridge.simplefin.org. */
function isSimplefinBridgeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "bridge.simplefin.org" || u.hostname === "beta-bridge.simplefin.org");
  } catch {
    return false;
  }
}

async function launch(): Promise<void> {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  // The server runs in this process (see server.ts), so it reaches the OS keystore through a
  // global (the same pattern as the PrismaClient singleton). Nothing is exposed to the window.
  // It encrypts the stored SimpleFIN Access URL (src/server/secret-box.ts): Windows DPAPI,
  // tied to this Windows account. Registered before the server starts.
  (globalThis as { __cashflowOsKeystore?: unknown }).__cashflowOsKeystore = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain: string) => safeStorage.encryptString(plain),
    decrypt: (sealed: Buffer) => safeStorage.decryptString(sealed),
  };

  server = await startServer({
    ...paths,
    dbFile: path.join(app.getPath("userData"), "cashflow.db"),
    backupDir: path.join(app.getPath("userData"), "backups"),
  });
  const origin = new URL(server.url).origin;

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // Only the local app may be shown: block pop-ups and navigation to other origins.
  // SimpleFIN Bridge links open in the user's own browser, never in this window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSimplefinBridgeUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(server.url);
}
