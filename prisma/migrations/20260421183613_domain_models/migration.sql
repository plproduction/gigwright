-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('ICLOUD', 'GOOGLE', 'OUTLOOK', 'NONE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VENMO', 'PAYPAL', 'ZELLE', 'CASHAPP', 'CASH', 'CHECK', 'DIRECT_DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('INQUIRY', 'HOLD', 'CONFIRMED', 'PLAYED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressL1" TEXT,
    "addressL2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Musician" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "initials" TEXT,
    "roles" TEXT[],
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "calendarProvider" "CalendarProvider" NOT NULL DEFAULT 'NONE',
    "paymentMethod" "PaymentMethod",
    "notifyBySms" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Musician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gig" (
    "id" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "loadInAt" TIMESTAMP(3),
    "soundcheckAt" TIMESTAMP(3),
    "callTimeAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" "GigStatus" NOT NULL DEFAULT 'CONFIRMED',
    "clientPayCents" INTEGER,
    "clientDepositCents" INTEGER,
    "sound" TEXT,
    "lights" TEXT,
    "attire" TEXT,
    "meal" TEXT,
    "notes" TEXT,
    "venueId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GigPersonnel" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "musicianId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "payCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "paidMethod" "PaymentMethod",
    "calendarSynced" BOOLEAN NOT NULL DEFAULT false,
    "calendarSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GigPersonnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Venue_ownerId_idx" ON "Venue"("ownerId");

-- CreateIndex
CREATE INDEX "Musician_ownerId_idx" ON "Musician"("ownerId");

-- CreateIndex
CREATE INDEX "Gig_ownerId_startAt_idx" ON "Gig"("ownerId", "startAt");

-- CreateIndex
CREATE INDEX "GigPersonnel_gigId_idx" ON "GigPersonnel"("gigId");

-- CreateIndex
CREATE INDEX "GigPersonnel_musicianId_idx" ON "GigPersonnel"("musicianId");

-- CreateIndex
CREATE UNIQUE INDEX "GigPersonnel_gigId_musicianId_key" ON "GigPersonnel"("gigId", "musicianId");

-- CreateIndex
CREATE INDEX "Activity_gigId_createdAt_idx" ON "Activity"("gigId", "createdAt");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Musician" ADD CONSTRAINT "Musician_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GigPersonnel" ADD CONSTRAINT "GigPersonnel_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GigPersonnel" ADD CONSTRAINT "GigPersonnel_musicianId_fkey" FOREIGN KEY ("musicianId") REFERENCES "Musician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
