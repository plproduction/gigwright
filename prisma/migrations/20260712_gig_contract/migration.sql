-- Private client contract for this gig — PDF uploaded by the bandleader.
-- Same shape as setlistUrl / stagePlotUrl but explicitly bandleader-only:
-- never rendered on the public sheet, print sheet, musician portal, or
-- the band email fanout. So Patrick doesn't have to hunt through email
-- for a signed venue contract on gig night.
ALTER TABLE "Gig" ADD COLUMN "contractUrl" TEXT;
ALTER TABLE "Gig" ADD COLUMN "contractFileName" TEXT;
