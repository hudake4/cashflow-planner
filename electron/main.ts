/**
 * CashFlow Planner desktop entry point.
 *  - One instance only; a second launch focuses the existing window.
 *  - Closing the window quits the app, which stops the in-process server (see server.ts).
 *  - The window can only show the local app: external navigation and new windows are blocked,
 *    except teller.io (Teller Connect for bank logins).
 *  - Optional Teller settings come from teller.json in the data folder.
 */
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, Menu, session } from "electron";
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
    dialog.showErrorBox(`${APP_NAME} could not start`, err instanceof Error ? err.stack ?? err.message : String(err));
    app.exit(1);
  });
}

/** True for https://teller.io and its subdomains (e.g. connect.teller.io). */
function isTellerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "teller.io" || u.hostname.endsWith(".teller.io"));
  } catch {
    return false;
  }
}

/**
 * The desktop app doesn't load .env. An optional teller.json in the app's data folder
 * ({ applicationId, environment, certPath, keyPath }) is mapped onto the same environment
 * variables the server reads. Variables that are already set win.
 */
function loadTellerSettings(file: string): void {
  if (!fs.existsSync(file)) return;
  try {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const map: Record<string, string> = {
      applicationId: "TELLER_APPLICATION_ID",
      environment: "TELLER_ENVIRONMENT",
      certPath: "TELLER_CERT_PATH",
      keyPath: "TELLER_KEY_PATH",
    };
    for (const [key, envName] of Object.entries(map)) {
      const value = cfg[key];
      if (typeof value === "string" && value.trim() && !process.env[envName]) process.env[envName] = value.trim();
    }
  } catch (err) {
    dialog.showErrorBox(`${APP_NAME}: invalid teller.json`, `${file}\n\n${err instanceof Error ? err.message : String(err)}`);
  }
}

async function launch(): Promise<void> {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  loadTellerSettings(path.join(app.getPath("userData"), "teller.json"));

  server = await startServer({
    ...paths,
    dbFile: path.join(app.getPath("userData"), "cashflow.db"),
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

  // Teller Connect (bank login) may open a pop-up or navigate; allow teller.io only.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => ({ action: isTellerUrl(url) ? "allow" : "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin && !isTellerUrl(url)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(server.url);
}
