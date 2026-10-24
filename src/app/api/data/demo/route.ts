import { todayLocal } from "@/domain/dates";
import { db } from "@/server/db";
import { loadDemoData } from "@/server/demo";
import { handle, json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Replaces all data with the labeled demo set (the UI confirms first). */
export const POST = () =>
  handle(async () => {
    await loadDemoData(db, todayLocal());
    return json({ ok: true });
  });
