import { handle, json, noContent } from "@/server/http";
import { getInstitution, removeInstitution } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) =>
  handle(async () => json(await getInstitution((await params).id)));

/** Revokes access at Teller (best effort), then deletes the institution locally. */
export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    await removeInstitution((await params).id);
    return noContent();
  });
