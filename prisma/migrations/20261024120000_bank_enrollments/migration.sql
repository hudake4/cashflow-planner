-- CreateTable
CREATE TABLE "BankEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "institutionId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    CONSTRAINT "BankAccount_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "BankEnrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankEnrollment_householdId_idx" ON "BankEnrollment"("householdId");

-- CreateIndex
CREATE INDEX "BankAccount_enrollmentId_idx" ON "BankAccount"("enrollmentId");
