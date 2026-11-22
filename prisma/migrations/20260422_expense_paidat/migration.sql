-- AlterTable: add paidAt column to GigExpense
--
-- Guarded. On a database built from empty this migration runs BEFORE
-- 20260422021217_gig_expenses creates "GigExpense": Prisma sorts this folder's
-- short 8-digit prefix ahead of that one's same-day 14-digit prefix. In that
-- case this is a no-op, and gig_expenses creates the table with "paidAt"
-- already on it. On a database where the table exists -- the live one, and
-- every database migrated before 2026-11-22 -- this adds the column exactly as
-- it always did.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'GigExpense'
  ) THEN
    ALTER TABLE "GigExpense" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
  END IF;
END $$;
