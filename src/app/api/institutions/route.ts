import { connectInstitutionSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { connectInstitution, listInstitutions } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

export const GET = () => handle(async () => json(await listInstitutions()));

/** Saves the enrollment returned by Teller Connect. The token is never echoed back. */
export const POST = (req: Request) =>
  handle(async () => json(await connectInstitution(await parseBody(req, connectInstitutionSchema)), 201));
