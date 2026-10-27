import { accountUpdateInputSchema } from "@/contracts/api";
import { handle, json, parseBody } from "@/server/http";
import { setAccountCardFields, setAccountKind } from "@/server/repositories/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; accountId: string }> };

/** Labels an account and/or sets its credit-card fields. */
export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id, accountId } = await params;
    const body = await parseBody(req, accountUpdateInputSchema);
    let account = await (async () => {
      if (body.kind !== undefined) {
        return setAccountKind(id, accountId, body.kind);
      }
      // still need account existence; handled below
      return null;
    })();
    if (
      body.statementClosingDay !== undefined ||
      body.paymentDueDay !== undefined ||
      body.statementClosingDate !== undefined ||
      body.paymentDueDate !== undefined ||
      body.aprBasisPoints !== undefined ||
      body.minimumPaymentRule !== undefined
    ) {
      account = await setAccountCardFields(id, accountId, {
        statementClosingDay: body.statementClosingDay,
        paymentDueDay: body.paymentDueDay,
        statementClosingDate: body.statementClosingDate,
        paymentDueDate: body.paymentDueDate,
        aprBasisPoints: body.aprBasisPoints,
        minimumPaymentRule: body.minimumPaymentRule,
      });
    }
    if (!account) throw new Error("no update");
    return json(account);
  });
