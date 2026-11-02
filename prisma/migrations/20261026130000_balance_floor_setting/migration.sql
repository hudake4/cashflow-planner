-- Balance floor: lowest projected balance the user wants to stay above (safe-to-spend, issue #41). Existing rows default to 0, so nothing changes for existing databases.
ALTER TABLE "Settings" ADD COLUMN "balanceFloorCents" INTEGER NOT NULL DEFAULT 0;
