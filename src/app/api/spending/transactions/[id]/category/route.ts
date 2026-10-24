import { spendingCategoryInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { setTransactionCategory } from "@/server/repositories/spending";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Sets (or, with a null category, clears) the user's category for one transaction; returns the refreshed analysis. */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params;
    return json(await setTransactionCategory(id, await parseBody(req, spendingCategoryInputSchema)));
  });
