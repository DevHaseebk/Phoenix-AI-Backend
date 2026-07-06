-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MealLogSource" AS ENUM ('MANUAL', 'AI_CHAT', 'WHATSAPP', 'IMPORTED');

-- CreateEnum
CREATE TYPE "MealLogStatus" AS ENUM ('LOGGED', 'ESTIMATED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED');

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "source" "MealLogSource" NOT NULL DEFAULT 'MANUAL',
    "status" "MealLogStatus" NOT NULL DEFAULT 'LOGGED',
    "confidenceLevel" "ConfidenceLevel" NOT NULL DEFAULT 'VERIFIED',
    "description" TEXT,
    "note" TEXT,
    "totalCalories" DECIMAL(65,30) NOT NULL,
    "totalProteinGrams" DECIMAL(65,30) NOT NULL,
    "totalCarbsGrams" DECIMAL(65,30),
    "totalFatGrams" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_log_items" (
    "id" TEXT NOT NULL,
    "mealLogId" TEXT NOT NULL,
    "foodName" TEXT NOT NULL,
    "portionLabel" TEXT,
    "quantity" DECIMAL(65,30),
    "calories" DECIMAL(65,30) NOT NULL,
    "proteinGrams" DECIMAL(65,30) NOT NULL,
    "carbsGrams" DECIMAL(65,30),
    "fatGrams" DECIMAL(65,30),
    "confidenceLevel" "ConfidenceLevel" NOT NULL DEFAULT 'VERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_log_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_logs_userId_idx" ON "meal_logs"("userId");

-- CreateIndex
CREATE INDEX "meal_logs_loggedAt_idx" ON "meal_logs"("loggedAt");

-- CreateIndex
CREATE INDEX "meal_logs_mealType_idx" ON "meal_logs"("mealType");

-- CreateIndex
CREATE INDEX "meal_logs_userId_loggedAt_idx" ON "meal_logs"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "meal_log_items_mealLogId_idx" ON "meal_log_items"("mealLogId");

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_log_items" ADD CONSTRAINT "meal_log_items_mealLogId_fkey" FOREIGN KEY ("mealLogId") REFERENCES "meal_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
