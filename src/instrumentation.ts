/** Runs once when the server starts (dev, `next start` and the desktop app's in-process server). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutoSync } = await import("./server/auto-sync");
  startAutoSync();
}
