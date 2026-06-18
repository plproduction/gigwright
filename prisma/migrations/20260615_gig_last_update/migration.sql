-- Last "Send update" the bandleader fired for this gig — captures the
-- headline (lastUpdateLabel) and free-form message (lastUpdateMessage)
-- that were sent in the email/SMS fanout, plus when. Rendered at the
-- TOP of every sheet surface so a musician clicking through from an SMS
-- alert sees the actual change-note instead of static gig info.
ALTER TABLE "Gig" ADD COLUMN "lastUpdateLabel" TEXT;
ALTER TABLE "Gig" ADD COLUMN "lastUpdateMessage" TEXT;
ALTER TABLE "Gig" ADD COLUMN "lastUpdateAt" TIMESTAMP(3);
