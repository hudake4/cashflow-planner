// Smoke test for `next dev`: starts the dev server on its own throwaway database
// (prisma/test-smoke.db), requests / and /api/settings, and fails unless both return 200.
// Dev compiles src/instrumentation.ts for the edge runtime as well, which `next build` does not
// catch if a Node-only import (node:crypto) leaks in. CI runs this as "Dev server smoke test".
// Port 3000 only, like the app; fails fast if it is taken. Cross-platform: no shell, no extra packages.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_DIR = path.join(ROOT, "prisma");
const PORT = 3000;
const PATHS = ["/api/settings", "/"];
const TIMEOUT_MS = 180_000;
const env = { ...process.env, DATABASE_URL: "file:./test-smoke.db", NEXT_TELEMETRY_DISABLED: "1" };

function cleanDb() {
  if (!existsSync(PRISMA_DIR)) return;
  for (const name of readdirSync(PRISMA_DIR)) {
    if (name.startsWith("test-smoke.db")) rmSync(path.join(PRISMA_DIR, name), { force: true });
  }
}

// Fail fast if port 3000 is taken, so a 200 can never come from some other server.
const portCheck = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-port.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
if (portCheck.status !== 0) process.exit(portCheck.status ?? 1);

cleanDb();
const migrate = spawnSync(
  process.execPath,
  [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
  { cwd: ROOT, env, stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const child = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)],
  { cwd: ROOT, env, stdio: "inherit" },
);
let exited = false;
child.on("exit", () => {
  exited = true;
});

function stopServer() {
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    cleanDb();
    process.exit(1);
  });
}

async function check(urlPath) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = "no response";
  while (Date.now() < deadline) {
    if (exited) throw new Error("the dev server exited early");
    try {
      const res = await fetch(`http://localhost:${PORT}${urlPath}`);
      if (res.status === 200) return;
      last = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
      // Compilation errors are 500s that will not recover; a slow first compile is not one.
      if (res.status >= 500) throw new Error(last);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("HTTP ")) throw err;
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${last} (gave up after ${TIMEOUT_MS / 1000}s)`);
}

let failed = false;
try {
  for (const urlPath of PATHS) {
    await check(urlPath);
    console.log(`[dev-smoke] GET ${urlPath} -> 200`);
  }
} catch (err) {
  failed = true;
  console.error(`[dev-smoke] FAILED: ${err instanceof Error ? err.message : err}`);
} finally {
  stopServer();
  // Give the server a moment to release the SQLite file before deleting it.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  cleanDb();
}
process.exit(failed ? 1 : 0);
