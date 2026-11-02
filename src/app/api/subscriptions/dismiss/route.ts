import { dismissSubscriptionInputSchema } from "@/contracts/api";
import { handle, noContent, parseBody } from "@/server/http";
import { dismissRecurring } from "@/server/repositories/subscriptions";

export const dynamic = "force-dynamic";

/** Marks a recurring charge as "not a subscription" so the audit stops showing it. */
export const POST = (req: Request) =>
  handle(async () => {
    const { key } = await parseBody(req, dismissSubscriptionInputSchema);
    await dismissRecurring(key);
    return noContent();
  });
