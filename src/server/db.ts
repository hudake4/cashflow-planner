/**
 * PrismaClient singleton. Cached on globalThis so Next.js hot reloads don't open
 * a new SQLite connection on every change. DATABASE_URL is read by Prisma from
 * the environment, so tests can point at a separate database.
 */
import { PrismaClient } from "@prisma/client";

export { HOUSEHOLD_ID } from "./defaults";

const globalForPrisma = globalThis as unknown as { __cashflowPrisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.__cashflowPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__cashflowPrisma = db;
