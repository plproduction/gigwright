-- Rooming / lodging info for a gig. The bandleader picks one of two forms:
-- typed notes (roomingInfo) OR an uploaded rooming-list document
-- (roomingUrl + roomingFileName). All three optional.
ALTER TABLE "Gig" ADD COLUMN "roomingInfo" TEXT;
ALTER TABLE "Gig" ADD COLUMN "roomingUrl" TEXT;
ALTER TABLE "Gig" ADD COLUMN "roomingFileName" TEXT;
