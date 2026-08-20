-- AlterTable
ALTER TABLE "DressSize" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AddCheckConstraint
-- Enforces at least one physical unit at the database level, not just in
-- application code.
ALTER TABLE "DressSize" ADD CONSTRAINT "dress_size_quantity_positive" CHECK ("quantity" >= 1);
