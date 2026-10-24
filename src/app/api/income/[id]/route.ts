import { incomeInputSchema } from "@/contracts/api";
import { handle, json, noContent, parseBody } from "@/server/http";
import { deleteIncome, getIncome, updateIncome } from "@/server/repositories/income";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await getIncome((await params).id)));

export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    return json(await updateIncome(id, await parseBody(req, incomeInputSchema)));
  });

export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await deleteIncome((await params).id);
    return noContent();
  });
