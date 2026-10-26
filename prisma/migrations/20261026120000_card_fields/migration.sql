-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN "statementClosingDay" INTEGER;
ALTER TABLE "BankAccount" ADD COLUMN "paymentDueDay" INTEGER;
ALTER TABLE "BankAccount" ADD COLUMN "aprBasisPoints" INTEGER;
ALTER TABLE "BankAccount" ADD COLUMN "minimumPaymentRule" TEXT;
