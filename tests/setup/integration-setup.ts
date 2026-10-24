/**
 * Per-file setup for integration tests: refuses to run against anything other
 * than the dedicated test DB, and wipes all tables before each test.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach } from "vitest";

const url = process.env.DATABASE_URL ?? "";
if (url !== "file:./test-integration.db") {
  throw new Error(`Integration tests must use the test DB, got DATABASE_URL=${url}`);
}

export const testPrisma = new PrismaClient({ datasources: { db: { url } } });

export async function resetTables() {
  await testPrisma.billOccurrence.deleteMany();
  await testPrisma.bill.deleteMany();
  await testPrisma.incomeSource.deleteMany();
  await testPrisma.settings.deleteMany();
}

beforeEach(async () => {
  await resetTables();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
