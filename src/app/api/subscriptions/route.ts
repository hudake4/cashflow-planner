import { handle, json } from "@/server/http";
import { subscriptionAudit } from "@/server/repositories/subscriptions";

export const dynamic = "force-dynamic";

/** The subscription audit: detected recurring charges plus the user's tracked bills. Reads local data only. */
export const GET = () => handle(async () => json(await subscriptionAudit()));
