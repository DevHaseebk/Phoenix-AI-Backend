-- CreateEnum
CREATE TYPE "AiConversationType" AS ENUM ('COACHING', 'MEAL_LOGGING');

-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiMealEstimateStatus" AS ENUM ('DRAFT', 'NEEDS_CLARIFICATION', 'CONFIRMED', 'DISCARDED');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "type" "AiConversationType" NOT NULL DEFAULT 'COACHING',
    "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "model" TEXT,
    "tokenInput" INTEGER,
    "tokenOutput" INTEGER,
    "latencyMs" INTEGER,
    "safetyFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_meal_estimates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "originalText" TEXT NOT NULL,
    "mealType" "MealType",
    "status" "AiMealEstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "calories" INTEGER,
    "proteinGrams" DOUBLE PRECISION,
    "carbsGrams" DOUBLE PRECISION,
    "fatGrams" DOUBLE PRECISION,
    "fiberGrams" DOUBLE PRECISION,
    "items" JSONB NOT NULL,
    "clarificationQuestions" JSONB,
    "assumptions" JSONB,
    "warnings" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "mealLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_meal_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_userId_idx" ON "ai_conversations"("userId");

-- CreateIndex
CREATE INDEX "ai_conversations_type_idx" ON "ai_conversations"("type");

-- CreateIndex
CREATE INDEX "ai_conversations_status_idx" ON "ai_conversations"("status");

-- CreateIndex
CREATE INDEX "ai_conversations_updatedAt_idx" ON "ai_conversations"("updatedAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_idx" ON "ai_messages"("conversationId");

-- CreateIndex
CREATE INDEX "ai_messages_userId_idx" ON "ai_messages"("userId");

-- CreateIndex
CREATE INDEX "ai_messages_createdAt_idx" ON "ai_messages"("createdAt");

-- CreateIndex
CREATE INDEX "ai_meal_estimates_userId_idx" ON "ai_meal_estimates"("userId");

-- CreateIndex
CREATE INDEX "ai_meal_estimates_conversationId_idx" ON "ai_meal_estimates"("conversationId");

-- CreateIndex
CREATE INDEX "ai_meal_estimates_messageId_idx" ON "ai_meal_estimates"("messageId");

-- CreateIndex
CREATE INDEX "ai_meal_estimates_status_idx" ON "ai_meal_estimates"("status");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_meal_estimates" ADD CONSTRAINT "ai_meal_estimates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_meal_estimates" ADD CONSTRAINT "ai_meal_estimates_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_meal_estimates" ADD CONSTRAINT "ai_meal_estimates_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
