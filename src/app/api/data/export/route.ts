import packageJson from "../../../../../package.json";
import { todayLocal } from "@/domain/dates";
import { handle } from "@/server/http";
import { getDataExport } from "@/server/services";

export const dynamic = "force-dynamic";

/** Downloads every stored record as one JSON file. Never includes bank credentials. */
export const GET = () =>
  handle(async () => {
    const now = new Date();
    const data = await getDataExport(packageJson.version, now);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cashflow-planner-backup-${todayLocal(now)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
