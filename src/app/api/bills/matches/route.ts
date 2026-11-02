import { handle, json } from "@/server/http";
import { findBillMatches } from "@/server/repositories/bill-matches";

export const dynamic = "force-dynamic";

/** Stored bank transactions that look like payments of unpaid bill occurrences. Local data only; nothing is changed. */
export const GET = () => handle(async () => json(await findBillMatches()));
