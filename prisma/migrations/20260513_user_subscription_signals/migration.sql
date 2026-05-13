-- AlterTable: surface Stripe-driven subscription signals on the user
-- record so the billing page can render contextual nudges.
--
--   paymentFailedAt    — set on invoice.payment_failed, cleared on the next
--     successful invoice. UI shows "Your last payment failed."
--   trialEndingAt      — set on customer.subscription.trial_will_end (~3
--     days before charge), cleared on the first successful invoice. UI
--     shows "Trial ends [date] — add a card to keep Pro."
--   cancelAtPeriodEnd  — mirrors Stripe's cancel_at_period_end on the
--     active subscription. UI shows "Cancelled — Pro until [date]" until
--     subscription.deleted arrives at period end.
ALTER TABLE "User"
  ADD COLUMN "paymentFailedAt"   TIMESTAMP(3),
  ADD COLUMN "trialEndingAt"     TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
