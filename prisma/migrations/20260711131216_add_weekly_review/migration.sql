-- CreateTable
CREATE TABLE "weekly_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "avgCalories" DECIMAL(65,30),
    "avgProteinGrams" DECIMAL(65,30),
    "avgSteps" DECIMAL(65,30),
    "avgWaterMl" DECIMAL(65,30),
    "startWeightKg" DECIMAL(65,30),
    "endWeightKg" DECIMAL(65,30),
    "weightChangeKg" DECIMAL(65,30),
    "consistencyRate" DECIMAL(65,30),
    "aiSummary" TEXT,
    "aiRecommendations" JSONB,
    "generatedByProvider" TEXT,
    "generatedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_reviews_weekStartDate_weekEndDate_idx" ON "weekly_reviews"("weekStartDate", "weekEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reviews_userId_weekStartDate_key" ON "weekly_reviews"("userId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
