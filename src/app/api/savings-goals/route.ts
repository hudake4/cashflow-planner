import { savingsGoalInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { createSavingsGoal, listSavingsGoals } from "@/server/repositories/savings-goals";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listSavingsGoals()));

export const POST = (req: Request) =>
  handle(async () => json(await createSavingsGoal(await parseBody(req, savingsGoalInputSchema)), 201));
