import { handle, json } from "@/server/http";
import { listOccurrences } from "@/server/repositories/bills";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await listOccurrences((await params).id)));
