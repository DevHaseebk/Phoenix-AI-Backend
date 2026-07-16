-- AlterTable
ALTER TABLE "unknown_food_queue_items" ADD COLUMN     "linkedFoodItemId" TEXT;

-- CreateIndex
CREATE INDEX "unknown_food_queue_items_linkedFoodItemId_idx" ON "unknown_food_queue_items"("linkedFoodItemId");

-- AddForeignKey
ALTER TABLE "unknown_food_queue_items" ADD CONSTRAINT "unknown_food_queue_items_linkedFoodItemId_fkey" FOREIGN KEY ("linkedFoodItemId") REFERENCES "food_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
