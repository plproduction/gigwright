-- "My Crew" default lineup marker. Musicians with isCrew=true pre-fill
-- any new gig's personnel section when the bandleader clicks
-- "Load My Crew." Managed exclusively through the gig form; no
-- roster-page toggle by design.
ALTER TABLE "Musician" ADD COLUMN "isCrew" BOOLEAN NOT NULL DEFAULT false;
