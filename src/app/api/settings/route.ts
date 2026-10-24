import { settingsInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { getSettings, saveSettings } from "@/server/repositories/settings";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await getSettings()));

export const PUT = (req: Request) =>
  handle(async () => json(await saveSettings(await parseBody(req, settingsInputSchema))));
