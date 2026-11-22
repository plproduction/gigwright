-- The previous migration seeded senderEmail = 'patrick@patricklamb.com',
-- but patricklamb.com isn't verified at Resend (free plan caps at 1 domain,
-- gigwright.com already occupies the slot). So sends from his account
-- 403'd at the API. Clear the seed so his fanouts fall back to the
-- standardized "Patrick Lamb via GigWright" <gigs@gigwright.com> sender,
-- which uses the already-verified gigwright.com domain.
--
-- Guarded. On a database built from empty this runs BEFORE
-- 20260428_user_sender_email creates the column -- Prisma breaks ties within
-- the same 8-digit date prefix alphabetically, and "clear_founder..." sorts
-- first. That migration no longer seeds the address at all, so on a fresh
-- database there is nothing to clear and this is a no-op. On the live
-- database, where it ran in the order it was written, it did its job.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'User'
      AND column_name = 'senderEmail'
  ) THEN
    UPDATE "User"
      SET "senderEmail" = NULL
      WHERE "email" = 'patrick@patricklamb.com';
  END IF;
END $$;
