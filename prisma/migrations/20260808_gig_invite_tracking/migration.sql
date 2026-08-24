-- Email delivery tracking for gig invites. resendEmailId is Resend's
-- own id (returned in the POST /emails response), stored so we can
-- correlate later webhook events (email.opened, email.clicked) back
-- to this specific personnel row.
ALTER TABLE "GigPersonnel" ADD COLUMN "resendEmailId"   TEXT;
ALTER TABLE "GigPersonnel" ADD COLUMN "emailOpenedAt"   TIMESTAMP(3);
ALTER TABLE "GigPersonnel" ADD COLUMN "emailClickedAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX "GigPersonnel_resendEmailId_key" ON "GigPersonnel"("resendEmailId");
