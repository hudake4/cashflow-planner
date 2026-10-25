import { dataExportSchema } from "@/contracts/api";
import { db } from "@/server/db";
import { restoreData } from "@/server/restore";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

/** Replaces income, bills, occurrences and stored settings from a backup; banks stay as they are. */
export const POST = (req: Request) =>
  handle(async () => {
    const data = await parseBody(req, dataExportSchema);
    await restoreData(db, data);
    return json({ ok: true });
  });
