-- Per-musician, per-gig mileage tracking for 1099 sidemen. Lives separate
-- from GigExpense (which is bandleader-scoped) so a musician's commute to
-- a gig is their own tax record, never the bandleader's gig P&L.
CREATE TABLE "MusicianGigMileage" (
    "id" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "miles" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MusicianGigMileage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MusicianGigMileage_musicianId_gigId_key"
    ON "MusicianGigMileage"("musicianId", "gigId");

CREATE INDEX "MusicianGigMileage_musicianId_idx"
    ON "MusicianGigMileage"("musicianId");

CREATE INDEX "MusicianGigMileage_gigId_idx"
    ON "MusicianGigMileage"("gigId");

ALTER TABLE "MusicianGigMileage" ADD CONSTRAINT "MusicianGigMileage_musicianId_fkey"
    FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicianGigMileage" ADD CONSTRAINT "MusicianGigMileage_gigId_fkey"
    FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
