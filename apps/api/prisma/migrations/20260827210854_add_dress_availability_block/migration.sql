-- CreateTable
CREATE TABLE "DressAvailabilityBlock" (
    "id" SERIAL NOT NULL,
    "dressId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DressAvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DressAvailabilityBlock_dressId_idx" ON "DressAvailabilityBlock"("dressId");

-- AddForeignKey
ALTER TABLE "DressAvailabilityBlock" ADD CONSTRAINT "DressAvailabilityBlock_dressId_fkey" FOREIGN KEY ("dressId") REFERENCES "Dress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
