import { accountKindInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { setAccountKind } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; accountId: string }> };

/** Labels an account (bank, credit, loan, other). Only bank accounts count toward the starting balance. */
export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id, accountId } = await params;
    const { kind } = await parseBody(req, accountKindInputSchema);
    return json(await setAccountKind(id, accountId, kind));
  });
