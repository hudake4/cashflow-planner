-- CreateTable
CREATE TABLE "TransactionCategory" (
    "transactionId" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "category" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MerchantCategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "merchantKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TransactionCategory_householdId_idx" ON "TransactionCategory"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCategoryRule_householdId_merchantKey_key" ON "MerchantCategoryRule"("householdId", "merchantKey");
