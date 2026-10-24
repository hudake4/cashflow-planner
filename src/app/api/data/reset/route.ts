import { db } from "@/server/db";
import { resetAllData } from "@/server/demo";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Deletes all income, bills, occurrences and settings (the UI confirms first). */
export const POST = () =>
  handle(async () => {
    await resetAllData(db);
    return json({ ok: true });
  });
