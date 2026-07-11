-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('MAIN_DISH', 'SNACK', 'BEVERAGE', 'BREAD', 'PROTEIN', 'VEGETABLE', 'FRUIT', 'DAIRY', 'OTHER');

-- CreateEnum
CREATE TYPE "FoodDataConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FoodSource" AS ENUM ('USDA', 'PHOENIX_DB', 'FOUNDER_REVIEWED', 'AI_ESTIMATE');

-- CreateEnum
CREATE TYPE "UnknownFoodQueueStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_RESEARCH');

-- CreateTable
CREATE TABLE "food_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL DEFAULT 'OTHER',
    "caloriesPer100g" DECIMAL(65,30) NOT NULL,
    "proteinPer100g" DECIMAL(65,30) NOT NULL,
    "carbsPer100g" DECIMAL(65,30),
    "fatPer100g" DECIMAL(65,30),
    "defaultServingDescription" TEXT NOT NULL,
    "defaultServingGrams" DECIMAL(65,30) NOT NULL,
    "confidence" "FoodDataConfidence" NOT NULL DEFAULT 'MEDIUM',
    "source" "FoodSource" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_aliases" (
    "id" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "food_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unknown_food_queue_items" (
    "id" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "aiSuggestedEstimate" JSONB,
    "confidence" "FoodDataConfidence",
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suggestedCategory" "FoodCategory",
    "status" "UnknownFoodQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unknown_food_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_items_name_idx" ON "food_items"("name");

-- CreateIndex
CREATE INDEX "food_aliases_alias_idx" ON "food_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "food_aliases_foodItemId_alias_key" ON "food_aliases"("foodItemId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "unknown_food_queue_items_rawText_key" ON "unknown_food_queue_items"("rawText");

-- CreateIndex
CREATE INDEX "unknown_food_queue_items_status_idx" ON "unknown_food_queue_items"("status");

-- CreateIndex
CREATE INDEX "unknown_food_queue_items_frequency_idx" ON "unknown_food_queue_items"("frequency");

-- AddForeignKey
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
