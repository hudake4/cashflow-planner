import { handle, json } from "@/server/http";
import { syncConnection } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Explicit refresh from SimpleFIN (at least 15 minutes apart; 409 otherwise). */
export const POST = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await syncConnection((await params).id)));