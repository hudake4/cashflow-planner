// Completes .next/standalone for the desktop app (run after `next build`):
// Next leaves static assets out of the standalone folder, and the dev .env it copies
// must not ship (the desktop app sets DATABASE_URL itself).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("[prepare-desktop] .next/standalone/server.js not found. Run `next build` first.");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}
fs.rmSync(path.join(standalone, ".env"), { force: true });

console.log("[prepare-desktop] .next/standalone is ready.");
