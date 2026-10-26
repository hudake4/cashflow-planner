import { z } from "zod";
import { handle, json, parseBody } from "@/server/http";
import { estimateAndUpsertCardBill } from "@/server/repositories/cards";

const bodySchema = z.object({ variableSpendCents: z.number().int().min(0).optional() });

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; accountId: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { accountId } = await params;
    const body = await parseBody(req, bodySchema).catch(() => ({ variableSpendCents: undefined }));
    return json(await estimateAndUpsertCardBill(accountId, body.variableSpendCents ?? 0));
  });