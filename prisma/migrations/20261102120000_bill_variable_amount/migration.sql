-- Marks a bill whose amount changes every cycle (a credit card statement). Existing bills become false, so nothing about them changes.
ALTER TABLE "Bill" ADD COLUMN "variableAmount" BOOLEAN NOT NULL DEFAULT false;
