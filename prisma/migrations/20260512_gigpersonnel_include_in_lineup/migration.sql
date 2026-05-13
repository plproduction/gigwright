-- AlterTable: per-personnel "include in outgoing emails" toggle.
-- When false, this row is omitted from the Lineup section of the
-- band-facing email fanout — but the person themselves still
-- receives their own copy if their notify flags are on. Used for
-- crew/contractors (sound, lights, booking agent) whose contact info
-- shouldn't be circulated to the rest of the band.
ALTER TABLE "GigPersonnel"
  ADD COLUMN "includeInLineup" BOOLEAN NOT NULL DEFAULT true;
