/**
 * `npm run db:seed`: replaces all data with the clearly labeled demo data
 * (same module as POST /api/data/demo). Uses DATABASE_URL from the environment/.env.
 */
import { PrismaClient } from "@prisma/client";
import { todayLocal } from "../src/domain/dates";
import { loadDemoData } from "../src/server/demo";

async function main() {
  const prisma = new PrismaClient();
  try {
    const today = todayLocal();
    await loadDemoData(prisma, today);
    console.log(`Demo data loaded (projection start ${today}, starting balance $1,250.00).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
