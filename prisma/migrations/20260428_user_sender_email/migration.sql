-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "senderEmail" TEXT;

-- Seed the founder so his fanouts immediately use his own verified domain.
-- No-op for any environment that doesn't have this user.
UPDATE "User"
  SET "senderEmail" = 'patrick@patricklamb.com'
  WHERE "email" = 'patrick@patricklamb.com';
