/**
 * RAG knowledge-base seed: creates the placeholder DRAFT documents, chunks
 * them, generates Gemini embeddings, and stores everything in
 * rag_documents/rag_chunks.
 *
 * Run with: npm run seed:rag  (requires GEMINI_API_KEY in .env)
 *
 * Idempotent: re-running replaces previously seeded documents that share the
 * same category and title (chunks are removed via cascade).
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { GeminiAiProvider } from '../src/ai/providers/gemini-ai.provider';
import { chunkText } from '../src/ai/rag/rag-chunking.util';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  RAG_EMBEDDING_DIMENSION,
} from '../src/ai/rag/rag.constants';
import { ragSeedDocuments } from './seed-rag-content';

config();

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is required to generate embeddings for the RAG seed.',
    );
  }

  const embeddingModel =
    process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
  const prisma = new PrismaClient();
  const provider = new GeminiAiProvider(apiKey);

  try {
    for (const seedDocument of ragSeedDocuments) {
      await prisma.ragDocument.deleteMany({
        where: {
          category: seedDocument.category,
          title: seedDocument.title,
        },
      });

      const document = await prisma.ragDocument.create({
        data: {
          category: seedDocument.category,
          title: seedDocument.title,
          content: seedDocument.content,
          status: 'DRAFT',
        },
        select: { id: true },
      });
      const chunks = chunkText(seedDocument.content);
      const embeddings = await provider.generateEmbeddings({
        inputs: chunks.map((chunk) => chunk.content),
        model: embeddingModel,
        timeoutMs: 30000,
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: RAG_EMBEDDING_DIMENSION,
      });

      for (const chunk of chunks) {
        const created = await prisma.ragChunk.create({
          data: {
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
          },
          select: { id: true },
        });
        const vectorLiteral = `[${embeddings[chunk.chunkIndex].join(',')}]`;

        await prisma.$executeRaw`
          UPDATE rag_chunks
          SET embedding = ${vectorLiteral}::vector
          WHERE id = ${created.id}
        `;
      }

      console.log(
        `Seeded ${seedDocument.category} - "${seedDocument.title}" (${chunks.length} chunks, DRAFT)`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('RAG seed failed:', error);
  process.exitCode = 1;
});
