import { projectionQuerySchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { getBalanceHistory } from "@/server/services";

export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    const params = new URL(req.url).searchParams;
    const query = projectionQuerySchema.parse({ from: params.get("from") || undefined, to: params.get("to") || undefined });
    return json(await getBalanceHistory(query.from, query.to));
  });
