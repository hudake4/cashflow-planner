-- CreateTable
CREATE TABLE "Settings" (
    "householdId" TEXT NOT NULL PRIMARY KEY DEFAULT 'local',
    "startingBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "projectionStartDate" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "forecastDays" INTEGER NOT NULL DEFAULT 90,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 0,
    "defaultCalendarView" TEXT NOT NULL DEFAULT 'month',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "anchorDate" TEXT NOT NULL,
    "endDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL DEFAULT 'local',
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "anchorDate" TEXT NOT NULL,
    "endDate" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BillOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "amountOverrideCents" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillOccurrence_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IncomeSource_householdId_idx" ON "IncomeSource"("householdId");

-- CreateIndex
CREATE INDEX "Bill_householdId_idx" ON "Bill"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "BillOccurrence_billId_dueDate_key" ON "BillOccurrence"("billId", "dueDate");
