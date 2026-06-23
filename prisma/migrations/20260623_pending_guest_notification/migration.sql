-- Queued guest-approval notification. When the bandleader toggles a
-- guest, instead of firing email/SMS immediately we upsert a row here
-- with scheduledFor = now + 2 min. A processor fires the notification
-- only if the net state actually changed after the window — rapid
-- tick/untick collapses to a single message reflecting the final state.
CREATE TABLE "PendingGuestNotification" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "initialState" BOOLEAN NOT NULL,
    "pendingState" BOOLEAN NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingGuestNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingGuestNotification_personnelId_guestName_key"
    ON "PendingGuestNotification"("personnelId", "guestName");

CREATE INDEX "PendingGuestNotification_scheduledFor_idx"
    ON "PendingGuestNotification"("scheduledFor");

ALTER TABLE "PendingGuestNotification" ADD CONSTRAINT "PendingGuestNotification_personnelId_fkey"
    FOREIGN KEY ("personnelId") REFERENCES "GigPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
