import { db } from "@/server/db";
import { resetAllData } from "@/server/demo";
import { handle, json } from "@/server/http";
import { revokeAllInstitutions } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

/** Deletes all income, bills, occurrences, bank connections and settings (the UI confirms first). */
export const POST = () =>
  handle(async () => {
    await revokeAllInstitutions();
    await resetAllData(db);
    return json({ ok: true });
  });
