-- Referral program: refer 3 paying users, your own subscription becomes
-- $0 via a 100%-off recurring Stripe coupon. All fields additive and
-- nullable; no existing data touched.
ALTER TABLE "User" ADD COLUMN "referralCode"       TEXT;
ALTER TABLE "User" ADD COLUMN "referredById"       TEXT;
ALTER TABLE "User" ADD COLUMN "referralCompActive" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

ALTER TABLE "User"
    ADD CONSTRAINT "User_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
