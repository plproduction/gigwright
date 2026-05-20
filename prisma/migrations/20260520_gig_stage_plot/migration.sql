-- Add stage-plot fields to Gig. Mirrors loadingMapUrl + (separately tracked)
-- filename pattern. PDF or image upload, optional per gig.
ALTER TABLE "Gig" ADD COLUMN "stagePlotUrl" TEXT;
ALTER TABLE "Gig" ADD COLUMN "stagePlotFileName" TEXT;
