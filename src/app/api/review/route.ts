import { handle, json } from "@/server/http";
import { getReview } from "@/server/repositories/review";

export const dynamic = "force-dynamic";

/** Income, tracked bills paid and spending for this week and this month against the previous ones. Local data only. */
export const GET = () => handle(async () => json(await getReview()));
