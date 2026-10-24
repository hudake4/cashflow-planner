-- Label for each bank account. Existing rows become BANK, so a database that already sums its accounts keeps the same starting balance until the user relabels something.
ALTER TABLE "BankAccount" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'BANK';
