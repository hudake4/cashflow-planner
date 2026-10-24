import { projectionQuerySchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { getProjection } from "@/server/services";

export const dynamic = "force-dynamic";

export const GET = (req: Request) =>
  handle(async () => {
    const params = new URL(req.url).searchParams;
    // Missing or empty params mean "use the default" (full window).
    const query = projectionQuerySchema.parse({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
    });
    return json(await getProjection(query.from, query.to));
  });
