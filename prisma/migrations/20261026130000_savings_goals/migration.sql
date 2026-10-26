-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "name" TEXT,
    "targetAmountCents" INTEGER NOT NULL,
    "targetDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SavingsGoal_householdId_idx" ON "SavingsGoal"("householdId");
