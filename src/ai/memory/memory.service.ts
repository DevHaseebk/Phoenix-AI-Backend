import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMemoryCategory, AiMemoryStatus } from '@prisma/client';
import { AI_PROVIDER } from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import { memoryExtractionPrompt } from '../prompts/memory-extraction.prompt';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  RAG_EMBEDDING_DIMENSION,
} from '../rag/rag.constants';
import { normalizeMemoryExtraction } from './memory-extraction.util';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetrievedMemory {
  id: string;
  category: AiMemoryCategory;
  content: string;
  confidence: number;
  similarity: number;
}

export interface MemoryResponse {
  id: string;
  category: AiMemoryCategory;
  content: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

const extractionMaxOutputChars = 800;

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * Embeds the user's message and returns the top-K most similar ACTIVE
   * memories for this user (visible or hidden - both are legitimate context
   * for the model; only GET /me/memories filters to visible-only).
   */
  async retrieveRelevantMemories(
    userId: string,
    query: string,
    topK = 4,
  ): Promise<RetrievedMemory[]> {
    if (!this.aiProvider.generateEmbeddings) {
      return [];
    }

    try {
      const embeddings = await this.aiProvider.generateEmbeddings({
        inputs: [query.slice(0, 2000)],
        model: this.embeddingModel(),
        timeoutMs: this.timeoutMs(),
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: RAG_EMBEDDING_DIMENSION,
      });
      const embedding = embeddings[0];

      if (!embedding || embedding.length !== RAG_EMBEDDING_DIMENSION) {
        return [];
      }

      const vectorLiteral = `[${embedding.join(',')}]`;
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          category: AiMemoryCategory;
          content: string;
          confidence: number;
          similarity: number;
        }>
      >`
        SELECT id, category, content, confidence,
          1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM ai_memories
        WHERE "userId" = ${userId}
          AND status = 'ACTIVE'
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `;

      return rows.map((row) => ({
        ...row,
        similarity: Number(row.similarity),
      }));
    } catch (error) {
      this.logger.warn(
        `Memory retrieval skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      return [];
    }
  }

  /**
   * Fire-and-forget after a chat reply has already been returned to the
   * user: decides whether the turn contained anything worth remembering
   * long-term, and saves it if so. Never throws - failures are logged only.
   */
  async extractAndSaveMemory(userId: string, turnText: string): Promise<void> {
    if (!this.aiProvider.extractMemory) {
      return;
    }

    try {
      const response = await this.aiProvider.extractMemory({
        systemPrompt: memoryExtractionPrompt,
        userPrompt: turnText.slice(0, extractionMaxOutputChars * 2),
        model: this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
        timeoutMs: this.timeoutMs(),
      });
      const decision = normalizeMemoryExtraction(response.structured);

      if (!decision.shouldSave || !decision.category || !decision.content) {
        return;
      }

      const embedding = await this.embedText(decision.content);

      const created = await this.prisma.aiMemory.create({
        data: {
          userId,
          category: decision.category,
          content: decision.content,
          confidence: decision.confidence ?? 0.6,
          isUserVisible: decision.isUserVisible,
        },
        select: { id: true },
      });

      if (embedding) {
        await this.setEmbedding(created.id, embedding);
      }

      this.logger.log(
        `Saved ${decision.category} memory for user ${userId}: "${decision.content}"`,
      );
    } catch (error) {
      this.logger.warn(
        `Memory extraction skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async listVisibleMemories(userId: string): Promise<MemoryResponse[]> {
    const memories = await this.prisma.aiMemory.findMany({
      where: { userId, isUserVisible: true, status: AiMemoryStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        category: true,
        content: true,
        confidence: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return memories;
  }

  async updateMemoryContent(
    userId: string,
    id: string,
    content: string,
  ): Promise<MemoryResponse> {
    await this.ensureOwnedVisibleMemory(userId, id);

    const embedding = await this.embedText(content);
    const updated = await this.prisma.aiMemory.update({
      where: { id },
      data: { content },
      select: {
        id: true,
        category: true,
        content: true,
        confidence: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (embedding) {
      await this.setEmbedding(id, embedding);
    }

    return updated;
  }

  async archiveMemory(userId: string, id: string): Promise<void> {
    await this.ensureOwnedVisibleMemory(userId, id);

    await this.prisma.aiMemory.update({
      where: { id },
      data: { status: AiMemoryStatus.ARCHIVED },
      select: { id: true },
    });
  }

  private async ensureOwnedVisibleMemory(
    userId: string,
    id: string,
  ): Promise<void> {
    const memory = await this.prisma.aiMemory.findFirst({
      where: {
        id,
        userId,
        isUserVisible: true,
        status: AiMemoryStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!memory) {
      throw new NotFoundException('Memory not found');
    }
  }

  private async embedText(text: string): Promise<number[] | null> {
    if (!this.aiProvider.generateEmbeddings) {
      return null;
    }

    try {
      const embeddings = await this.aiProvider.generateEmbeddings({
        inputs: [text],
        model: this.embeddingModel(),
        timeoutMs: this.timeoutMs(),
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: RAG_EMBEDDING_DIMENSION,
      });

      return embeddings[0] ?? null;
    } catch (error) {
      this.logger.warn(
        `Memory embedding skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      return null;
    }
  }

  private async setEmbedding(id: string, embedding: number[]): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;

    await this.prisma.$executeRaw`
      UPDATE ai_memories
      SET embedding = ${vectorLiteral}::vector
      WHERE id = ${id}
    `;
  }

  private embeddingModel(): string {
    return (
      this.config.get<string>('GEMINI_EMBEDDING_MODEL') ??
      DEFAULT_GEMINI_EMBEDDING_MODEL
    );
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000');
  }
}

export function formatMemoryBlock(memories: RetrievedMemory[]): string {
  return memories
    .map((memory) => `[${memory.category}] ${memory.content}`)
    .join('\n');
}
