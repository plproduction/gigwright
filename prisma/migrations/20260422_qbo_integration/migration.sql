-- QBO OAuth tokens + company pointer
CREATE TABLE "QboConnection" (
  "id"                        TEXT PRIMARY KEY,
  "userId"                    TEXT NOT NULL UNIQUE,
  "realmId"                   TEXT NOT NULL,
  "accessToken"               TEXT NOT NULL,
  "refreshToken"              TEXT NOT NULL,
  "expiresAt"                 TIMESTAMP(3) NOT NULL,
  "defaultExpenseAccountId"   TEXT,
  "defaultExpenseAccountName" TEXT,
  "connectedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QboConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Sync state on Gig + per-row pointers on GigPersonnel
ALTER TABLE "Gig"
  ADD COLUMN "qboSyncedAt" TIMESTAMP(3),
  ADD COLUMN "qboSyncError" TEXT;

ALTER TABLE "GigPersonnel"
  ADD COLUMN "qboVendorId" TEXT,
  ADD COLUMN "qboBillId"   TEXT;
