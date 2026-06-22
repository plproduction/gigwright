-- Bandleader-approved subset of the names in GigPersonnel.guestList.
-- Each entry is the exact line string ("Sarah Smith +1") so approvals
-- survive unrelated edits and intentionally drop when a specific name
-- changes. Empty array = nothing approved yet.
ALTER TABLE "GigPersonnel" ADD COLUMN "approvedGuests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
