import { handle, json } from "@/server/http";
import { getSpending } from "@/server/repositories/spending";

export const dynamic = "force-dynamic";

/** Where money went last month and so far this month, by category. Local data only. */
export const GET = () => handle(async () => json(await getSpending()));
