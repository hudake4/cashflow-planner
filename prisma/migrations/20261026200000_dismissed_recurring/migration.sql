-- CreateTable
CREATE TABLE "DismissedRecurring" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DismissedRecurring_householdId_key_key" ON "DismissedRecurring"("householdId", "key");

-- CreateIndex
CREATE INDEX "DismissedRecurring_householdId_idx" ON "DismissedRecurring"("householdId");
