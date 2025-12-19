/*
  Warnings:

  - You are about to drop the column `nummberValue` on the `Cell` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Cell_columnId_nummberValue_idx";

-- AlterTable
ALTER TABLE "Cell" DROP COLUMN "nummberValue",
ADD COLUMN     "numberValue" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Cell_columnId_numberValue_idx" ON "Cell"("columnId", "numberValue");
