import { savingsGoalInputSchema } from "@/contracts/api";
import { handle, json, noContent, parseBody } from "@/server/http";
import { deleteSavingsGoal, getSavingsGoal, updateSavingsGoal } from "@/server/repositories/savings-goals";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await getSavingsGoal((await params).id)));

export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    return json(await updateSavingsGoal(id, await parseBody(req, savingsGoalInputSchema)));
  });

export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await deleteSavingsGoal((await params).id);
    return noContent();
  });
