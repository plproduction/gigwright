-- AlterTable: optional "second show" downbeat and finish times.
-- Many jazz clubs run two shows in one night (e.g. Funky Biscuit
-- 6 PM and 9 PM sets). Rather than forcing the bandleader to create
-- two separate gig records, we let one gig carry an optional second
-- show. Both null = single show. Renders extra rows in the email
-- schedule and extra tiles in the gig detail / public sheet / musician
-- portal when populated.
ALTER TABLE "Gig"
  ADD COLUMN "secondStartAt" TIMESTAMP(3),
  ADD COLUMN "secondEndAt"   TIMESTAMP(3);
