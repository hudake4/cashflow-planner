import { scenarioInputSchema } from "@/contracts/api";
import { handle, json } from "@/server/http";
import { getDashboard, getScenarioDashboard } from "@/server/services";
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
    const scenarioRaw = params.get("scenario") || params.get("scenarios");
    if (scenarioRaw) {
      const scenario = parseScenarioParam(scenarioRaw);
      const today = params.get("today") || undefined;
      return json(await getScenarioDashboard(scenario, today));
    }
    return json(await getDashboard());
  });
