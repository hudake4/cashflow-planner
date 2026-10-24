import { handle, noContent } from "@/server/http";
import { removeConnection } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Removes the connection and its stored data locally. SimpleFIN has no revoke API. */
export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await removeConnection((await params).id);
    return noContent();
  });