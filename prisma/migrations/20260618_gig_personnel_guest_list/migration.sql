-- Per-musician, per-gig guest list. Freeform multi-line text ("Sarah
-- Smith +1", "Tom Jones") that musicians fill in from /my-gigs/[id].
-- Aggregated on the bandleader's gig detail page so they can hand a
-- single consolidated list to the venue.
ALTER TABLE "GigPersonnel" ADD COLUMN "guestList" TEXT;
ALTER TABLE "GigPersonnel" ADD COLUMN "guestListUpdatedAt" TIMESTAMP(3);
