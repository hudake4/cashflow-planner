/**
 * Runs once when the server starts (dev, `next start` and the desktop app's in-process server).
 *
 * Keep the positive `=== "nodejs"` guard around the import. `next dev` also compiles this file for
 * the edge runtime, and only a guard of this shape lets the bundler drop the import. An early
 * `return` does not, so the edge bundle follows auto-sync into `node:crypto` and every dev route
 * fails with `UnhandledSchemeError`. The "Dev server smoke test" CI job catches a regression.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSync } = await import("./server/auto-sync");
    startAutoSync();
  }
}
