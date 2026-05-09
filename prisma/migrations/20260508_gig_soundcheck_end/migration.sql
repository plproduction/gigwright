-- AlterTable: optional "Sound check complete" timestamp.
-- Let bandleaders mark when soundcheck ends so the band knows when
-- they're free between check and call. Renders in emails and the
-- gig detail Times tile.
ALTER TABLE "Gig"
  ADD COLUMN "soundcheckEndAt" TIMESTAMP(3);
