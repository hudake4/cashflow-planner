import { bankTransactionsQuerySchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { listTransactions } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Live from Teller, newest first. `fromId` pages back to older transactions. */
export const GET = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    const sp = new URL(req.url).searchParams;
    const query = bankTransactionsQuerySchema.parse({
      accountId: sp.get("accountId") ?? undefined,
      fromId: sp.get("fromId") || undefined,
    });
    return json(await listTransactions(id, query));
  });
