-- DropIndex
DROP INDEX "Cell_columnId_idx";

-- CreateIndex
CREATE INDEX "Cell_columnId_textValue_idx" ON "Cell"("columnId", "textValue");

-- CreateIndex
CREATE INDEX "Cell_columnId_nummberValue_idx" ON "Cell"("columnId", "nummberValue");
