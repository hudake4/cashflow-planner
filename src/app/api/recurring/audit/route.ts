import { handle, json } from "@/server/http";
import { scanRecurring } from "@/server/repositories/recurring";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await scanRecurring()));
