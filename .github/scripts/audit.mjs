// Runs `npm audit` and fails on any high or critical advisory that is not in
// ACCEPTED. Used by the `audit` job in .github/workflows/checks.yml.
//
// Do not add an entry without a reason in README, "Known dependency advisories".
import { spawnSync } from "node:child_process";

const ACCEPTED = new Map([
  // deepmerge-ts via @prisma/config (Prisma 6 dev-time config loader). The only
  // fix is the breaking Prisma 7 upgrade.
  ["GHSA-ggr8-5vv4-36mx", "deepmerge-ts stack exhaustion, see README"],
  // electron 44.7.0: eMudhra certificate mitigation, fixed in 44.9.1 (2026-10-20).
  // The app only loads 127.0.0.1. Remove this entry when bumping Electron, due
  // once 44.9.x is two weeks old (from 2026-11-04).
  ["GHSA-jr5w-w6x2-84p9", "electron certificate mitigation, upgrade from 2026-11-04, see README"],
  // zod 3: memory exhaustion on oversized collections. All input is the single
  // local user's own; the fix is the breaking zod 4 upgrade, tracked separately.
  ["GHSA-mrhx-c7xc-m3w5", "zod oversized-collection DoS, local single user, see README"],
]);

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(`::error::npm audit did not return JSON.\n${result.stderr}`);
  process.exit(1);
}
if (report.error || !report.vulnerabilities) {
  console.error(`::error::npm audit failed: ${JSON.stringify(report.error ?? report)}`);
  process.exit(1);
}

const advisories = new Map();
for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === "string") continue;
    const id = via.url?.split("/").pop() ?? String(via.source);
    advisories.set(id, { id, name: via.name ?? name, severity: via.severity, title: via.title, url: via.url });
  }
}

const blocking = [];
for (const advisory of advisories.values()) {
  if (advisory.severity !== "high" && advisory.severity !== "critical") continue;
  if (ACCEPTED.has(advisory.id)) {
    console.log(`Accepted: ${advisory.id} ${advisory.name} (${ACCEPTED.get(advisory.id)})`);
    continue;
  }
  blocking.push(advisory);
}

for (const a of blocking) {
  console.error(`::error::${a.severity} advisory ${a.id} in ${a.name}: ${a.title} ${a.url}`);
}
if (blocking.length > 0) process.exit(1);
console.log("No unaccepted high or critical advisories.");
