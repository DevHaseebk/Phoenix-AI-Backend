-- CreateEnum
CREATE TYPE "ExerciseLogSource" AS ENUM ('MANUAL', 'DEVICE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('WALKING', 'RUNNING', 'CYCLING', 'STRENGTH', 'CARDIO', 'SPORTS', 'STEPS', 'OTHER');

-- CreateTable
CREATE TABLE "exercise_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseType" "ExerciseType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "steps" INTEGER,
    "distanceKm" DECIMAL(65,30),
    "estimatedCaloriesBurned" INTEGER,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "source" "ExerciseLogSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_logs_userId_idx" ON "exercise_logs"("userId");

-- CreateIndex
CREATE INDEX "exercise_logs_loggedAt_idx" ON "exercise_logs"("loggedAt");

-- CreateIndex
CREATE INDEX "exercise_logs_userId_loggedAt_idx" ON "exercise_logs"("userId", "loggedAt");

-- AddForeignKey
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
