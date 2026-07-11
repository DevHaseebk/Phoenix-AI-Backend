-- CreateEnum
CREATE TYPE "MealPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlannedMealSource" AS ENUM ('FOOD_DB', 'AI_ESTIMATE');

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_meals" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealSlotIndex" INTEGER NOT NULL,
    "mealSlotLabel" TEXT NOT NULL,
    "foodDescription" TEXT NOT NULL,
    "calories" DECIMAL(65,30) NOT NULL,
    "proteinGrams" DECIMAL(65,30) NOT NULL,
    "carbsGrams" DECIMAL(65,30),
    "fatGrams" DECIMAL(65,30),
    "source" "PlannedMealSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_list_items" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "note" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plans_userId_status_idx" ON "meal_plans"("userId", "status");

-- CreateIndex
CREATE INDEX "planned_meals_mealPlanId_dayOfWeek_idx" ON "planned_meals"("mealPlanId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "grocery_list_items_mealPlanId_idx" ON "grocery_list_items"("mealPlanId");

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_meals" ADD CONSTRAINT "planned_meals_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_list_items" ADD CONSTRAINT "grocery_list_items_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
