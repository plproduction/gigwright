-- Per-musician guest-list cap for this gig. Null = no cap. Set when
-- the venue restricts ("two per band member"). The musician's row
-- shows N / cap used and the + Add another link disables at the cap.
ALTER TABLE "Gig" ADD COLUMN "guestListCap" INTEGER;
