-- CreateTable
CREATE TABLE "GigExpense" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GigExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GigExpense_gigId_idx" ON "GigExpense"("gigId");

-- AddForeignKey
ALTER TABLE "GigExpense" ADD CONSTRAINT "GigExpense_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
