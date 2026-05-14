-- CreateTable: SmsOptIn
-- Public-form opt-in records — the TCR-verifiable Call to Action for our
-- A2P 10DLC campaign. The form lives at /sms-opt-in. A reviewer (or any
-- musician) can submit, see a confirmation, and a row lands here as
-- the verifiable trail.
CREATE TABLE "SmsOptIn" (
  "id"          TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "name"        TEXT,
  "bandleader"  TEXT,
  "consentText" TEXT NOT NULL,
  "userAgent"   TEXT,
  "ipAddress"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SmsOptIn_pkey" PRIMARY KEY ("id")
);

-- Indexes: phone for lookups, createdAt for time-ordered review.
CREATE INDEX "SmsOptIn_phone_idx"     ON "SmsOptIn"("phone");
CREATE INDEX "SmsOptIn_createdAt_idx" ON "SmsOptIn"("createdAt");
