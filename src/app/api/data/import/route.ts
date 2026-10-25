import { dataExportSchema } from "@/contracts/api";
import { db } from "@/server/db";
import { restoreDataImport } from "@/server/data-import";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

/** Destructively restores planner data from an exported JSON backup; bank connections are kept. */
export const POST = (req: Request) =>
  handle(async () => json(await restoreDataImport(db, await parseBody(req, dataExportSchema))));
