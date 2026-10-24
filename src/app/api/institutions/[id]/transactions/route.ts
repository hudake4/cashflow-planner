import { BANK_TRANSACTIONS_PAGE_SIZE, bankTransactionsQuerySchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { listTransactions } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Stored transactions of one account, newest first, 50 per page (`offset` pages back). */
export const GET = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    const sp = new URL(req.url).searchParams;
    const query = bankTransactionsQuerySchema.parse({
      accountId: sp.get("accountId") ?? undefined,
      offset: sp.get("offset") || undefined,
    });
    return json(await listTransactions(id, query.accountId, { offset: query.offset, limit: BANK_TRANSACTIONS_PAGE_SIZE }));
  });