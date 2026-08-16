-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DressStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "Dress" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "color" TEXT,
    "status" "DressStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DressPhoto" (
    "id" SERIAL NOT NULL,
    "dressId" INTEGER NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "processedUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DressSize" (
    "id" SERIAL NOT NULL,
    "dressId" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DressSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "dressId" INTEGER NOT NULL,
    "renterId" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dress_ownerId_idx" ON "Dress"("ownerId");

-- CreateIndex
CREATE INDEX "Dress_status_idx" ON "Dress"("status");

-- CreateIndex
CREATE INDEX "DressPhoto_dressId_idx" ON "DressPhoto"("dressId");

-- CreateIndex
CREATE INDEX "DressSize_dressId_idx" ON "DressSize"("dressId");

-- CreateIndex
CREATE UNIQUE INDEX "DressSize_dressId_size_key" ON "DressSize"("dressId", "size");

-- CreateIndex
CREATE INDEX "Booking_dressId_idx" ON "Booking"("dressId");

-- CreateIndex
CREATE INDEX "Booking_renterId_idx" ON "Booking"("renterId");

-- CreateIndex
CREATE INDEX "Booking_startDate_endDate_idx" ON "Booking"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Dress" ADD CONSTRAINT "Dress_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DressPhoto" ADD CONSTRAINT "DressPhoto_dressId_fkey" FOREIGN KEY ("dressId") REFERENCES "Dress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DressSize" ADD CONSTRAINT "DressSize_dressId_fkey" FOREIGN KEY ("dressId") REFERENCES "Dress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dressId_fkey" FOREIGN KEY ("dressId") REFERENCES "Dress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
