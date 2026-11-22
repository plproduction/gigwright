-- CreateTable
--
-- Written to be idempotent and self-sufficient, which it was not originally.
-- Prisma applies migrations in folder-name order, comparing the token before
-- the first underscore: a short 8-digit prefix ("20260422") sorts AHEAD of a
-- same-day 14-digit one ("20260422021217"). So on a database built from empty,
-- 20260422_expense_paidat runs BEFORE this migration and cannot find
-- "GigExpense" -- which is exactly how `prisma migrate deploy` died at
-- migration 3 of 45 on an empty database until 2026-11-22. That migration is
-- now guarded to no-op in that case, and this one creates the table with
-- "paidAt" already on it. On the live database, where the two ran in the order
-- they were written, nothing here ever re-runs.
CREATE TABLE IF NOT EXISTS "GigExpense" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GigExpense_pkey" PRIMARY KEY ("id")
);

-- Covers a database where the table already exists without the column.
ALTER TABLE "GigExpense" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GigExpense_gigId_idx" ON "GigExpense"("gigId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GigExpense_gigId_fkey'
  ) THEN
    ALTER TABLE "GigExpense"
      ADD CONSTRAINT "GigExpense_gigId_fkey"
      FOREIGN KEY ("gigId") REFERENCES "Gig"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
