-- Enable pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "RagDocumentCategory" AS ENUM ('PAKISTANI_FOODS', 'PLATEAU_HANDLING', 'WALKING_GUIDE', 'PROTEIN_GUIDE', 'BEHAVIOR_RULES', 'RAMADAN_GUIDE', 'SAFETY_BOUNDARIES', 'FLEXIBLE_MEALS', 'RESTAURANT_NOTES');

-- CreateEnum
CREATE TYPE "RagDocumentStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "rag_documents" (
    "id" TEXT NOT NULL,
    "category" "RagDocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rag_documents_category_status_idx" ON "rag_documents"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rag_chunks_documentId_chunkIndex_key" ON "rag_chunks"("documentId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "rag_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity index (cosine), per docs/09_Database_Schema.md section 23
CREATE INDEX rag_chunks_embedding_idx
ON rag_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
