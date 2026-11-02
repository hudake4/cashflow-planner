import { handle, json } from "@/server/http";
import { getAlerts } from "@/server/services";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await getAlerts()));
