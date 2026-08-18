-- CreateEnum
CREATE TYPE "DressPendingAction" AS ENUM ('ADD', 'REMOVE');

-- DropIndex
DROP INDEX "DressSize_dressId_size_key";

-- AlterTable
ALTER TABLE "Dress" ADD COLUMN     "pendingDetails" JSONB,
ADD COLUMN     "pendingReviewSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DressPhoto" ADD COLUMN     "pendingAction" "DressPendingAction";

-- AlterTable
ALTER TABLE "DressSize" ADD COLUMN     "pendingAction" "DressPendingAction";

-- CreateIndex
CREATE UNIQUE INDEX "DressSize_dressId_size_pendingAction_key" ON "DressSize"("dressId", "size", "pendingAction");
