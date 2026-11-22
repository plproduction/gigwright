-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "senderEmail" TEXT;

-- The original version of this migration also seeded
--   senderEmail = 'patrick@patricklamb.com'
-- for the founder. The very next migration, 20260428_clear_founder_sender_email,
-- undid that seed the same day because patricklamb.com is not a verified Resend
-- domain and every send 403'd.
--
-- The seed is removed here rather than left in place because Prisma replays
-- migrations in folder-name order, and within the same 8-digit date prefix that
-- order is alphabetical: "clear_founder_sender_email" sorts BEFORE
-- "user_sender_email". On a database built from empty, the clear therefore runs
-- first and the seed would be the last word -- rebuilding the database would
-- silently reintroduce the broken sender address that breaks email fanouts.
-- Leaving the column NULL is the end state the live database has had since
-- 2026-04-28.
