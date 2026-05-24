-- Optional event/performance name (e.g. "Patrick Lamb Quartet",
-- "Smith Wedding", "NYE Show"). Renders alongside the venue name
-- everywhere a gig is identified — never replaces it.
ALTER TABLE "Gig" ADD COLUMN "eventName" TEXT;
