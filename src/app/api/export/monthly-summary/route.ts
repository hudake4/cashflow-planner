import { monthlySummaryQuerySchema } from "@/contracts/api";
import { handle } from "@/server/http";
import { renderMonthlySummaryPdf } from "@/server/monthly-summary-pdf";
import { getMonthlySummary } from "@/server/services";

export const dynamic = "force-dynamic";

/** Downloads one month's summary (totals, weeks, income by source, bills by category) as a PDF. */
export const GET = (req: Request) =>
  handle(async () => {
    const query = monthlySummaryQuerySchema.parse({ month: new URL(req.url).searchParams.get("month") ?? undefined });
    const pdf = await renderMonthlySummaryPdf(await getMonthlySummary(query.month), new Date());
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cashflow-summary-${query.month}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
