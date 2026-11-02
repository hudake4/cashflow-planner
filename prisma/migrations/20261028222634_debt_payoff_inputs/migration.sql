-- Debt payoff inputs (issue #104). Both changes are additive; existing rows keep today's behaviour.
-- A real monthly minimum payment per account. Existing accounts get NULL, so the planner keeps using its 2% / $25 estimate.
ALTER TABLE "BankAccount" ADD COLUMN "minimumPaymentCents" INTEGER;
-- The total monthly payment on the Debt payoff page. Existing settings rows get 50000 ($500.00), the value that was hardcoded before.
ALTER TABLE "Settings" ADD COLUMN "debtMonthlyPaymentCents" INTEGER NOT NULL DEFAULT 50000;
