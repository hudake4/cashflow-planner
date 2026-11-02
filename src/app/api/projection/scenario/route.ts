import { z } from "zod";
import { isoDateSchema, scenarioInputSchema } from "@/contracts/api";
import { badRequest, handle, json, readJson } from "@/server/http";
import { getScenarioProjection } from "@/server/services";

export const dynamic = "force-dynamic";

function parseScenario(value: unknown) {
  if (Array.isArray(value)) return z.array(scenarioInputSchema).parse(value);
  return scenarioInputSchema.parse(value);
}

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await readJson(req)) as Record<string, unknown>;
    const from = body.from ? isoDateSchema.parse(body.from) : undefined;
    const to = body.to ? isoDateSchema.parse(body.to) : undefined;
    const candidate = body.scenario ?? body.scenarios ?? body;
    const scenario = parseScenario(candidate);
    return json(await getScenarioProjection(scenario, from, to));
  });

export const GET = (req: Request) =>
  handle(async () => {
    const params = new URL(req.url).searchParams;
    const from = params.get("from") || undefined;
    const to = params.get("to") || undefined;
    const raw = params.get("scenario") || params.get("scenarios");
    if (!raw) throw badRequest("scenario is required");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    }
    const scenario = parseScenario(parsed);
    return json(await getScenarioProjection(scenario, from, to));
  });