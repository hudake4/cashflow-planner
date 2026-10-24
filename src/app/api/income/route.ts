import { incomeInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { createIncome, listIncome } from "@/server/repositories/income";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listIncome()));

export const POST = (req: Request) =>
  handle(async () => json(await createIncome(await parseBody(req, incomeInputSchema)), 201));
