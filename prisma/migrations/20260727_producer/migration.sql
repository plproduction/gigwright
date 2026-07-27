-- Producer entity: people who book Patrick (client contacts). Populated
-- from contract extraction or added manually. Distinct from Venue's
-- contact fields because the same producer books events at many venues.
CREATE TABLE "Producer" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "email"     TEXT,
    "phone"     TEXT,
    "company"   TEXT,
    "notes"     TEXT,
    "ownerId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Producer_ownerId_idx" ON "Producer"("ownerId");
CREATE INDEX "Producer_ownerId_email_idx" ON "Producer"("ownerId", "email");

ALTER TABLE "Producer"
    ADD CONSTRAINT "Producer_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Link Gig → Producer (nullable — legacy gigs have no producer).
ALTER TABLE "Gig" ADD COLUMN "producerId" TEXT;

CREATE INDEX "Gig_producerId_idx" ON "Gig"("producerId");

ALTER TABLE "Gig"
    ADD CONSTRAINT "Gig_producerId_fkey"
    FOREIGN KEY ("producerId") REFERENCES "Producer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
