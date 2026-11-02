-- AlterTable
ALTER TABLE "BankConnection" ADD COLUMN "lastCompleteSyncAt" DATETIME;

-- Existing connections keep their current window: start from the last successful sync, as before.
UPDATE "BankConnection" SET "lastCompleteSyncAt" = "lastSyncedAt";
