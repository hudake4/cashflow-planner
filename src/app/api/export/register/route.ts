import { projectionQuerySchema } from "@/contracts/api";
import { handle } from "@/server/http";
import { getRegisterCsv } from "@/server/services";

export const dynamic = "force-dynamic";

/** Downloads the register (one row per income or bill, with its running balance) as CSV. */
export const GET = (req: Request) =>
  handle(async () => {
    const params = new URL(req.url).searchParams;
    // Same range rules as /api/projection: missing or empty means the full window.
    const query = projectionQuerySchema.parse({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
    });
    const { csv, range } = await getRegisterCsv(query.from, query.to);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cashflow-register-${range.from}-to-${range.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
