import { describe, expect, it } from "vitest";
import { db } from "@/server/db";

describe("integration DB isolation", () => {
  it("the app's Prisma client is connected to prisma/test-integration.db, never dev.db", async () => {
    const rows = await db.$queryRawUnsafe<{ name: string; file: string }[]>("PRAGMA database_list");
    const main = rows.find((r) => r.name === "main")!;
    expect(main.file.replace(/\\/g, "/")).toMatch(/\/prisma\/test-integration\.db$/);
  });
});
