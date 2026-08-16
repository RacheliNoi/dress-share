-- CreateTable
CREATE TABLE "ClothingItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "imageUrl" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClothingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClothingItem_userId_idx" ON "ClothingItem"("userId");

-- AddForeignKey
ALTER TABLE "ClothingItem" ADD CONSTRAINT "ClothingItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
