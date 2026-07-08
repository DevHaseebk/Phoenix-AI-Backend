import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AI_PROVIDER } from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  RAG_EMBEDDING_DIMENSION,
} from './rag.constants';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetrievedRagChunk {
  id: string;
  content: string;
  category: string;
  title: string;
  similarity: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * Embeds the query and returns only the top-K most similar knowledge
   * chunks (never the full knowledge base). Any failure degrades to an
   * empty result so chat/meal flows keep working without RAG.
   */
  async retrieveRelevantChunks(
    query: string,
    topK = 4,
  ): Promise<RetrievedRagChunk[]> {
    if (!this.aiProvider.generateEmbeddings) {
      return [];
    }

    try {
      const embeddings = await this.aiProvider.generateEmbeddings({
        inputs: [query.slice(0, 2000)],
        model:
          this.config.get<string>('GEMINI_EMBEDDING_MODEL') ??
          DEFAULT_GEMINI_EMBEDDING_MODEL,
        timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000'),
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: RAG_EMBEDDING_DIMENSION,
      });
      const embedding = embeddings[0];

      if (!embedding || embedding.length !== RAG_EMBEDDING_DIMENSION) {
        return [];
      }

      // DRAFT content is retrievable outside production so seeded knowledge
      // can be exercised before founder approval; production is APPROVED-only.
      const statuses =
        this.config.get<string>('NODE_ENV') === 'production'
          ? ['APPROVED']
          : ['APPROVED', 'DRAFT'];
      const vectorLiteral = `[${embedding.join(',')}]`;
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          category: string;
          title: string;
          similarity: number;
        }>
      >`
        SELECT
          c.id,
          c.content,
          d.category::text AS category,
          d.title,
          1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM rag_chunks c
        JOIN rag_documents d ON d.id = c."documentId"
        WHERE c.embedding IS NOT NULL
          AND d.status::text IN (${Prisma.join(statuses)})
        ORDER BY c.embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `;

      return rows.map((row) => ({
        ...row,
        similarity: Number(row.similarity),
      }));
    } catch (error) {
      this.logger.warn(
        `RAG retrieval skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      return [];
    }
  }
}

export function formatKnowledgeBlock(chunks: RetrievedRagChunk[]): string {
  return chunks
    .map((chunk) => `[${chunk.category} | ${chunk.title}]\n${chunk.content}`)
    .join('\n\n');
}
