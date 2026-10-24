import { handle, json } from "@/server/http";
import { getDashboard } from "@/server/services";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await getDashboard()));
