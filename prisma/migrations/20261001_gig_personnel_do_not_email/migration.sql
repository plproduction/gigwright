-- Per-gig "Do not email or text" flag on a personnel row. When true, the
-- gig's email and SMS paths (Send update fanout, Accept/Decline invite,
-- guest-approval notices) skip this person. Built for festival gigs
-- where the personnel list includes whole tribute bands and sponsors
-- who shouldn't receive band alerts. Default false keeps every
-- existing row on the email list.
ALTER TABLE "GigPersonnel" ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false;
