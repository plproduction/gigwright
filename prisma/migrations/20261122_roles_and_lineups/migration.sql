-- Roles, call order and lineups — the shape of the band, and the
-- packages built from it.
--
-- Additive only. Musician.roles (String[]) and GigPersonnel.roleLabel
-- are untouched: free text still carries one-off festival jobs. What it
-- cannot carry is a call order or a default rate, which is what
-- Auto-Book and the payout worksheet need.
--
-- Hand-authored (no DATABASE_URL on the build machine) but every
-- statement below was taken from `prisma migrate diff --from-empty`
-- output for this same schema.

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "defaultPayCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleMember" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "callOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoleMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lineup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "sizeLabel" TEXT,
    "description" TEXT,
    "clientPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lineup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineupRole" (
    "id" TEXT NOT NULL,
    "lineupId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "payCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LineupRole_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "GigPersonnel" ADD COLUMN "roleId" TEXT;

-- CreateIndex
CREATE INDEX "Role_ownerId_position_idx" ON "Role"("ownerId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "Role_ownerId_name_key" ON "Role"("ownerId", "name");
-- CreateIndex
CREATE INDEX "RoleMember_roleId_callOrder_idx" ON "RoleMember"("roleId", "callOrder");
-- CreateIndex
CREATE UNIQUE INDEX "RoleMember_roleId_musicianId_key" ON "RoleMember"("roleId", "musicianId");
-- CreateIndex
CREATE INDEX "Lineup_ownerId_position_idx" ON "Lineup"("ownerId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "Lineup_ownerId_name_key" ON "Lineup"("ownerId", "name");
-- CreateIndex
CREATE INDEX "LineupRole_lineupId_position_idx" ON "LineupRole"("lineupId", "position");
-- CreateIndex
CREATE UNIQUE INDEX "LineupRole_lineupId_roleId_key" ON "LineupRole"("lineupId", "roleId");

-- AddForeignKey
ALTER TABLE "GigPersonnel" ADD CONSTRAINT "GigPersonnel_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RoleMember" ADD CONSTRAINT "RoleMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "RoleMember" ADD CONSTRAINT "RoleMember_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LineupRole" ADD CONSTRAINT "LineupRole_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LineupRole" ADD CONSTRAINT "LineupRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
