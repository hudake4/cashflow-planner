import { isValidIsoDate, occurrenceUpdateSchema } from "@/contracts/api";
import { badRequest, handle, json, noContent, parseBody } from "@/server/http";
import { deleteOccurrence, upsertOccurrence } from "@/server/repositories/bills";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; date: string }> };

async function resolveParams(params: Ctx["params"]) {
  const { id, date } = await params;
  if (!isValidIsoDate(date)) throw badRequest("Occurrence date must be a valid YYYY-MM-DD date.");
  return { id, date };
}

/** Records status/override; 400 BAD_REQUEST when `date` isn't a scheduled occurrence. */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id, date } = await resolveParams(params);
    const data = await parseBody(req, occurrenceUpdateSchema);
    return json(await upsertOccurrence(id, date, data));
  });

/** Resets the occurrence to UPCOMING at the default amount. */
export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id, date } = await resolveParams(params);
    await deleteOccurrence(id, date);
    return noContent();
  });
