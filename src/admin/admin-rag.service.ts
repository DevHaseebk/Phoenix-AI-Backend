import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RagDocumentStatus } from '@prisma/client';
import { AI_PROVIDER } from '../ai/ai-provider.interface';
import type { AiProvider } from '../ai/ai-provider.interface';
import { chunkText } from '../ai/rag/rag-chunking.util';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  RAG_EMBEDDING_DIMENSION,
} from '../ai/rag/rag.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAdminRagDocumentDto } from './dto/update-admin-rag-document.dto';

export interface AdminRagDocumentListItem {
  id: string;
  category: string;
  title: string;
  status: RagDocumentStatus;
  chunkCount: number;
  updatedAt: Date;
}

export interface AdminRagDocumentDetail {
  id: string;
  category: string;
  title: string;
  content: string;
  status: RagDocumentStatus;
  updatedAt: Date;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
  }>;
}

/**
 * RAG Content Review (admin-only) - list/edit the 9 seeded knowledge
 * documents, re-chunk + re-embed on a real content change, approve/
 * unapprove. Deliberately reuses rag-chunking.util.ts's chunkText() and the
 * exact AiProvider.generateEmbeddings() call shape prisma/seed-rag.ts uses
 * at seed time - not a second chunking/embedding implementation.
 */
@Injectable()
export class AdminRagService {
  private readonly logger = new Logger(AdminRagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(): Promise<AdminRagDocumentListItem[]> {
    const documents = await this.prisma.ragDocument.findMany({
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { chunks: true } } },
    });

    return documents.map((document) => ({
      id: document.id,
      category: document.category,
      title: document.title,
      status: document.status,
      chunkCount: document._count.chunks,
      updatedAt: document.updatedAt,
    }));
  }

  async getById(id: string): Promise<AdminRagDocumentDetail> {
    const document = await this.prisma.ragDocument.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: {
            id: true,
            chunkIndex: true,
            content: true,
            tokenCount: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('RAG document not found');
    }

    return document;
  }

  /**
   * Content-change is the ONLY re-embed trigger - a title-only edit updates
   * the row and returns immediately. This keeps a cosmetic rename free (no
   * AI-quota cost, no chunk churn) while any real content edit always gets
   * fresh chunks/embeddings, since stale embeddings would silently keep
   * serving the old text at retrieval time otherwise.
   */
  async update(
    id: string,
    dto: UpdateAdminRagDocumentDto,
    adminUserId: string,
  ): Promise<AdminRagDocumentDetail> {
    const existing = await this.prisma.ragDocument.findUnique({
      where: { id },
      select: { id: true, title: true, content: true },
    });

    if (!existing) {
      throw new NotFoundException('RAG document not found');
    }

    const contentChanged =
      dto.content !== undefined && dto.content !== existing.content;

    await this.prisma.ragDocument.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
      },
      select: { id: true },
    });

    if (contentChanged) {
      await this.reembed(id, dto.content as string);
    }

    await this.auditLog.record({
      adminUserId,
      action: 'rag-document.update',
      targetType: 'RagDocument',
      targetId: id,
      metadata: {
        before: { title: existing.title },
        after: { title: dto.title ?? existing.title },
        contentChanged,
      },
    });

    return this.getById(id);
  }

  async approve(
    id: string,
    adminUserId: string,
  ): Promise<AdminRagDocumentDetail> {
    await this.setStatus(id, RagDocumentStatus.APPROVED);
    await this.auditLog.record({
      adminUserId,
      action: 'rag-document.approve',
      targetType: 'RagDocument',
      targetId: id,
      metadata: { after: RagDocumentStatus.APPROVED },
    });

    return this.getById(id);
  }

  async unapprove(
    id: string,
    adminUserId: string,
  ): Promise<AdminRagDocumentDetail> {
    await this.setStatus(id, RagDocumentStatus.DRAFT);
    await this.auditLog.record({
      adminUserId,
      action: 'rag-document.unapprove',
      targetType: 'RagDocument',
      targetId: id,
      metadata: { after: RagDocumentStatus.DRAFT },
    });

    return this.getById(id);
  }

  private async setStatus(
    id: string,
    status: RagDocumentStatus,
  ): Promise<void> {
    try {
      await this.prisma.ragDocument.update({
        where: { id },
        data: { status },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('RAG document not found');
      }

      throw error;
    }
  }

  /**
   * Deletes the old chunks and regenerates them from the new content -
   * exactly seed-rag.ts's chunk+embed+raw-SQL-vector-update sequence, so
   * admin edits and the original seed can never drift into two different
   * pipelines. If the active AI provider has no generateEmbeddings (e.g. the
   * local/no-quota fallback) or a real embedding call fails, the new chunks
   * are still stored (retrieval falls back to no-match for them rather than
   * serving stale pre-edit content) and a warning is logged - never silently
   * left on the old chunks.
   */
  private async reembed(documentId: string, content: string): Promise<void> {
    await this.prisma.ragChunk.deleteMany({ where: { documentId } });

    const chunks = chunkText(content);

    if (chunks.length === 0) {
      return;
    }

    let embeddings: number[][] | null = null;

    if (this.aiProvider.generateEmbeddings) {
      try {
        embeddings = await this.aiProvider.generateEmbeddings({
          inputs: chunks.map((chunk) => chunk.content),
          model:
            this.config.get<string>('GEMINI_EMBEDDING_MODEL') ??
            DEFAULT_GEMINI_EMBEDDING_MODEL,
          timeoutMs: Number(
            this.config.get<string>('AI_TIMEOUT_MS') ?? '30000',
          ),
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: RAG_EMBEDDING_DIMENSION,
        });
      } catch (error) {
        this.logger.warn(
          `Re-embedding failed for document ${documentId}, chunks stored without embeddings: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    for (const chunk of chunks) {
      const created = await this.prisma.ragChunk.create({
        data: {
          documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
        },
        select: { id: true },
      });
      const vector = embeddings?.[chunk.chunkIndex];

      if (vector) {
        const vectorLiteral = `[${vector.join(',')}]`;

        await this.prisma.$executeRaw`
          UPDATE rag_chunks
          SET embedding = ${vectorLiteral}::vector
          WHERE id = ${created.id}
        `;
      }
    }
  }
}
