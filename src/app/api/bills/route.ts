import { billInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { createBill, listBills } from "@/server/repositories/bills";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listBills()));

export const POST = (req: Request) =>
  handle(async () => json(await createBill(await parseBody(req, billInputSchema)), 201));
