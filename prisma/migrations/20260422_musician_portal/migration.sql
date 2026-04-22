-- Applied via direct SQL (enum ADD VALUE can't run inside a transaction).
-- See lib/db setup script or migration log.
ALTER TABLE "Musician" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Musician" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
