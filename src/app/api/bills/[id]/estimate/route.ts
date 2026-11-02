import { isoDateSchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { estimateBill } from "@/server/repositories/estimate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Suggested amount for a bill from the stored bank history. A suggestion only; nothing is saved. Local data only. */
export const GET = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const date = new URL(req.url).searchParams.get("date");
    return json(await estimateBill((await params).id, date ? isoDateSchema.parse(date) : undefined));
  });
