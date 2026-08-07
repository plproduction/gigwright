-- Accept/Decline gig invitations, IML-style. Each GigPersonnel row
-- gets its own unguessable inviteToken and tracks whether the
-- musician has responded and how. All fields nullable so existing
-- rows are unaffected.
ALTER TABLE "GigPersonnel" ADD COLUMN "invitedAt"   TIMESTAMP(3);
ALTER TABLE "GigPersonnel" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "GigPersonnel" ADD COLUMN "response"    TEXT;
ALTER TABLE "GigPersonnel" ADD COLUMN "inviteToken" TEXT;

CREATE UNIQUE INDEX "GigPersonnel_inviteToken_key" ON "GigPersonnel"("inviteToken");
