import { connectInstitutionSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { connect, listConnections } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listConnections()));

/** Claims the SimpleFIN setup token and runs the first sync. The token and access URL are never echoed back. */
export const POST = (req: Request) =>
  handle(async () => json(await connect(await parseBody(req, connectInstitutionSchema)), 201));