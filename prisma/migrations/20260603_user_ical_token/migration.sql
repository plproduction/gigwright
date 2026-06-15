-- Calendar subscription token. Random unguessable string the user pastes
-- into Apple / Google / Outlook to subscribe to their gigs as a live
-- .ics feed. Generated on first request, then cached.
ALTER TABLE "User" ADD COLUMN "icalToken" TEXT;
CREATE UNIQUE INDEX "User_icalToken_key" ON "User"("icalToken");
