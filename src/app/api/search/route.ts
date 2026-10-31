import { searchInputSchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { search } from "@/server/repositories/search";

export const dynamic = "force-dynamic";

/** Bills, income, bank transactions, savings goals and accounts matching `q`, at most `limit` per group. Local data only. */
export const GET = (req: Request) =>
  handle(async () => {
    const sp = new URL(req.url).searchParams;
    const input = searchInputSchema.parse({ q: sp.get("q") ?? undefined, limit: sp.get("limit") || undefined });
    return json(await search(input.q, input.limit));
  });
