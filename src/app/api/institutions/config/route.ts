import { handle, json } from "@/server/http";
import { getPublicConfig } from "@/server/teller";

export const dynamic = "force-dynamic";

/** Whether Teller is set up, plus the public Application ID Teller Connect needs. */
export const GET = () => handle(async () => json(getPublicConfig()));
