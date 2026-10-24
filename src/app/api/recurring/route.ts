import { handle, json } from "@/server/http";
import { scanRecurring } from "@/server/repositories/recurring";

export const dynamic = "force-dynamic";

/** Repeating payments and deposits found in the stored bank history that aren't bills or income yet. Local data only. */
export const GET = () => handle(async () => json(await scanRecurring()));
