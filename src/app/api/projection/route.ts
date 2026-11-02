import { projectionQuerySchema, scenarioInputSchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { getProjection, getScenarioProjection } from "@/server/services";
import { z } from "zod";

export const dynamic = "force-dynamic";

function parseScenarioParam(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  }
  return Array.isArray(parsed) ? z.array(scenarioInputSchema).parse(parsed) : scenarioInputSchema.parse(parsed);
}

export const GET = (req: Request) =>
  handle(async () => {
    const params = new URL(req.url).searchParams;
    const from = params.get("from") || undefined;
    const to = params.get("to") || undefined;
    const scenarioRaw = params.get("scenario") || params.get("scenarios");
    if (scenarioRaw) {
      const scenario = parseScenarioParam(scenarioRaw);
      return json(await getScenarioProjection(scenario, from, to));
    }
    const query = projectionQuerySchema.parse({ from, to });
    return json(await getProjection(query.from, query.to));
  });
