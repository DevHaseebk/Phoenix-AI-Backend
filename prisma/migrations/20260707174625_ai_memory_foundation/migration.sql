-- CreateEnum
CREATE TYPE "AiMemoryCategory" AS ENUM ('PERMANENT_PROFILE', 'FOOD_PREFERENCE', 'PORTION_PATTERN', 'BEHAVIORAL_PATTERN', 'MOTIVATION_STYLE', 'TEMPORARY_LIFE_EVENT', 'MILESTONE', 'EMOTIONAL_SUPPORT_PATTERN');

-- CreateEnum
CREATE TYPE "AiMemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ai_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "AiMemoryCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "isUserVisible" BOOLEAN NOT NULL DEFAULT true,
    "status" "AiMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_memories_userId_category_idx" ON "ai_memories"("userId", "category");

-- AddForeignKey
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity index (cosine), matching the rag_chunks pattern from the RAG foundation migration
CREATE INDEX ai_memories_embedding_idx
ON ai_memories
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
