-- Repair the migration history so it reproduces the live schema.
--
-- WHY THIS EXISTS
--
-- Seven schema objects existed on the production database but were created by
-- no migration -- they were applied directly (by `prisma db push` or by hand)
-- as the app was built, and the history was never backfilled. Replaying
-- prisma/migrations into an empty database therefore produced a schema missing
-- an enum, an enum variant, six columns and two foreign keys that the
-- application code reads. A restore from migrations alone would have come up
-- subtly broken rather than loudly broken, which is worse.
--
-- Established 2026-11-22 by replaying the full chain into an empty Postgres and
-- diffing the result against production's own structure.
--
-- Every statement below is guarded, so this migration is a no-op against any
-- database that already has these objects -- production included.

-- 1. The ExpenseKind enum (GigExpense.kind).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseKind') THEN
    CREATE TYPE "ExpenseKind" AS ENUM ('GENERAL', 'MILEAGE', 'MEAL', 'PER_DIEM', 'LODGING', 'TRAVEL');
  END IF;
END $$;

-- 2. The MUSICIAN variant on UserRole (musician portal accounts).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MUSICIAN';

-- 3. GigExpense.kind / miles / days (mileage and per-diem expense rows).
ALTER TABLE "GigExpense" ADD COLUMN IF NOT EXISTS "kind" "ExpenseKind" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "GigExpense" ADD COLUMN IF NOT EXISTS "miles" INTEGER;
ALTER TABLE "GigExpense" ADD COLUMN IF NOT EXISTS "days" INTEGER;

-- 4. Gig load-in / loading-dock fields, shown on the run-of-show sheet.
ALTER TABLE "Gig" ADD COLUMN IF NOT EXISTS "loadingInfo" TEXT;
ALTER TABLE "Gig" ADD COLUMN IF NOT EXISTS "loadingMapUrl" TEXT;
ALTER TABLE "Gig" ADD COLUMN IF NOT EXISTS "loadingMapLink" TEXT;

-- 5. Musician.w9RequestedAt (W-9 chase tracking).
ALTER TABLE "Musician" ADD COLUMN IF NOT EXISTS "w9RequestedAt" TIMESTAMP(3);

-- 6. Musician.userId -> User.id. 20260422_musician_portal added the column but
--    never the foreign key; production has it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Musician_userId_fkey') THEN
    ALTER TABLE "Musician"
      ADD CONSTRAINT "Musician_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. QboConnection.userId was declared inline in 20260422_qbo_integration with
--    only ON DELETE CASCADE, so Postgres defaulted ON UPDATE to NO ACTION.
--    Production's constraint is ON UPDATE CASCADE. Rebuild it only when the
--    update action is actually wrong (confupdtype 'c' = CASCADE), so this is a
--    no-op on production rather than a needless lock on the table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'QboConnection_userId_fkey' AND confupdtype <> 'c'
  ) THEN
    ALTER TABLE "QboConnection" DROP CONSTRAINT "QboConnection_userId_fkey";
    ALTER TABLE "QboConnection"
      ADD CONSTRAINT "QboConnection_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
