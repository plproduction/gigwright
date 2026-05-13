-- AlterTable: bandleader-only "private finance notes" on a gig.
-- Lives on the Payout Worksheet for the leader's eyes only — never
-- sent to musicians in the email fanout, never rendered on the public
-- gig sheet, never shown in the musician portal.
ALTER TABLE "Gig"
  ADD COLUMN "privateFinanceNotes" TEXT;
