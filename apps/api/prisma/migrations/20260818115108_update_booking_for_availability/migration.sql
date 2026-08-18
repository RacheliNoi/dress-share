-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'INTERESTED';
ALTER TYPE "BookingStatus" ADD VALUE 'RENTED';

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_renterId_fkey";

-- DropIndex
DROP INDEX "Booking_dressId_idx";

-- DropIndex
DROP INDEX "Booking_startDate_endDate_idx";

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "renterId" DROP NOT NULL,
ALTER COLUMN "size" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'INTERESTED';

-- CreateIndex
CREATE INDEX "Booking_dressId_startDate_endDate_idx" ON "Booking"("dressId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint
-- Enforces a valid, non-inverted date range at the database level, not just
-- in application code. Equal start/end dates are allowed (a same-day hold).
ALTER TABLE "Booking" ADD CONSTRAINT "booking_end_date_after_start_date" CHECK ("endDate" >= "startDate");
