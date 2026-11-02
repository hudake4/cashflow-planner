/** docs/API.md must mention every route file under src/app/api (AGENTS.md: doc, code and tests change together). */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_DIR = path.resolve(__dirname, "../../src/app/api");
const API_DOC = readFileSync(path.resolve(__dirname, "../../docs/API.md"), "utf8");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** `src/app/api/bills/[id]/occurrences/[date]/route.ts` -> `/api/bills/:id/occurrences/:date` (the form API.md uses). */
function docPath(file: string): string {
  const segments = path.relative(API_DIR, path.dirname(file)).split(path.sep).filter(Boolean);
  return ["/api", ...segments.map((s) => s.replace(/^\[(.+)\]$/, ":$1"))].join("/");
}

describe("docs/API.md", () => {
  const routes = routeFiles(API_DIR).map(docPath).sort();

  it("finds the route files", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it.each(routes)("documents %s", (route) => {
    expect(API_DOC, `docs/API.md has no \`${route}\``).toContain(`\`${route}\``);
  });
});
