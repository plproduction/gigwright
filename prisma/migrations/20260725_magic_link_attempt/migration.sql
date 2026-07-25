-- CreateTable: log every /signin magic-link attempt so
-- auth.ts:sendVerificationRequest can rate-limit per email. Without
-- this the sign-in form is an open Resend spigot — an attacker can
-- POST any email to /api/auth/... and burn the account's daily quota.
CREATE TABLE "MagicLinkAttempt" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "outcome"   TEXT NOT NULL,
    "source"    TEXT NOT NULL DEFAULT 'signin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLinkAttempt_pkey" PRIMARY KEY ("id")
);

-- Per-email lookup uses (email, createdAt); pruning old rows uses createdAt alone.
CREATE INDEX "MagicLinkAttempt_email_createdAt_idx" ON "MagicLinkAttempt" ("email", "createdAt");
CREATE INDEX "MagicLinkAttempt_createdAt_idx"       ON "MagicLinkAttempt" ("createdAt");
