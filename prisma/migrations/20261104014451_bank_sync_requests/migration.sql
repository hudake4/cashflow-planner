-- CreateTable
CREATE TABLE "BankSyncRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    CONSTRAINT "BankSyncRequest_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankSyncRequest_connectionId_requestedAt_idx" ON "BankSyncRequest"("connectionId", "requestedAt");
