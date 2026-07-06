-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_WEIGHT');

-- CreateEnum
CREATE TYPE "GoalPace" AS ENUM ('SLOW', 'BALANCED', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "heightCm" DECIMAL(65,30),
    "currentWeightKg" DECIMAL(65,30),
    "targetWeightKg" DECIMAL(65,30),
    "goalType" "GoalType" NOT NULL DEFAULT 'LOSE_WEIGHT',
    "goalPace" "GoalPace" NOT NULL DEFAULT 'BALANCED',
    "activityLevel" "ActivityLevel",
    "timezone" TEXT DEFAULT 'Asia/Karachi',
    "preferredLanguage" TEXT DEFAULT 'en',
    "calorieTarget" DECIMAL(65,30),
    "proteinTargetGrams" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_onboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" TEXT,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "draft" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_onboarding_userId_key" ON "user_onboarding"("userId");

-- CreateIndex
CREATE INDEX "user_onboarding_status_idx" ON "user_onboarding"("status");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
