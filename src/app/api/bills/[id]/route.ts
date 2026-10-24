import { billInputSchema } from "@/contracts/api";
import { handle, json, noContent, parseBody } from "@/server/http";
import { deleteBill, getBill, updateBill } from "@/server/repositories/bills";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await getBill((await params).id)));

/** Full replacement; never touches occurrence rows. */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    return json(await updateBill(id, await parseBody(req, billInputSchema)));
  });

export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await deleteBill((await params).id);
    return noContent();
  });
