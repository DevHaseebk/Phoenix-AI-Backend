import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AiProvider } from '../ai/ai-provider.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRagService } from './admin-rag.service';

describe('AdminRagService', () => {
  const ragDocumentFindUnique = jest.fn();
  const ragDocumentFindMany = jest.fn();
  const ragDocumentUpdate = jest.fn();
  const ragChunkDeleteMany = jest.fn();
  const ragChunkCreate = jest.fn();
  const executeRaw = jest.fn();
  const prisma = {
    ragDocument: {
      findUnique: ragDocumentFindUnique,
      findMany: ragDocumentFindMany,
      update: ragDocumentUpdate,
    },
    ragChunk: {
      deleteMany: ragChunkDeleteMany,
      create: ragChunkCreate,
    },
    $executeRaw: executeRaw,
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const generateEmbeddings = jest.fn();
  const aiProvider = { generateEmbeddings } as unknown as AiProvider;
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(provider: AiProvider = aiProvider): AdminRagService {
    return new AdminRagService(prisma, config, provider, auditLog);
  }

  describe('list', () => {
    it('maps documents with their chunk count', async () => {
      ragDocumentFindMany.mockResolvedValue([
        {
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          status: 'DRAFT',
          updatedAt: new Date('2026-01-01'),
          _count: { chunks: 3 },
        },
      ]);
      const service = makeService();

      const result = await service.list();

      expect(result).toEqual([
        {
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          status: 'DRAFT',
          chunkCount: 3,
          updatedAt: new Date('2026-01-01'),
        },
      ]);
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when the document does not exist', async () => {
      ragDocumentFindUnique.mockResolvedValue(null);
      const service = makeService();

      await expect(service.getById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the document does not exist', async () => {
      ragDocumentFindUnique.mockResolvedValue(null);
      const service = makeService();

      await expect(
        service.update('missing', { title: 'New title' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does NOT re-embed on a title-only change', async () => {
      ragDocumentFindUnique
        .mockResolvedValueOnce({ id: 'doc-1', content: 'Original content.' })
        .mockResolvedValueOnce({
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'New title',
          content: 'Original content.',
          status: 'DRAFT',
          updatedAt: new Date(),
          chunks: [],
        });
      const service = makeService();

      await service.update('doc-1', { title: 'New title' }, 'admin-1');

      expect(ragDocumentUpdate).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { title: 'New title' },
        select: { id: true },
      });
      expect(ragChunkDeleteMany).not.toHaveBeenCalled();
      expect(generateEmbeddings).not.toHaveBeenCalled();
    });

    it('does NOT re-embed when content is given but identical to the stored value', async () => {
      ragDocumentFindUnique
        .mockResolvedValueOnce({ id: 'doc-1', content: 'Same content.' })
        .mockResolvedValueOnce({
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          content: 'Same content.',
          status: 'DRAFT',
          updatedAt: new Date(),
          chunks: [],
        });
      const service = makeService();

      await service.update('doc-1', { content: 'Same content.' }, 'admin-1');

      expect(ragChunkDeleteMany).not.toHaveBeenCalled();
      expect(generateEmbeddings).not.toHaveBeenCalled();
    });

    it('re-chunks and re-embeds on a real content change', async () => {
      ragDocumentFindUnique
        .mockResolvedValueOnce({ id: 'doc-1', content: 'Old content.' })
        .mockResolvedValueOnce({
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          content: 'Brand new content that is different.',
          status: 'DRAFT',
          updatedAt: new Date(),
          chunks: [],
        });
      ragChunkCreate.mockResolvedValue({ id: 'chunk-1' });
      generateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
      const service = makeService();

      await service.update(
        'doc-1',
        { content: 'Brand new content that is different.' },
        'admin-1',
      );

      expect(ragChunkDeleteMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1' },
      });
      expect(generateEmbeddings).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'RETRIEVAL_DOCUMENT' }),
      );
      expect(ragChunkCreate).toHaveBeenCalled();
      expect(executeRaw).toHaveBeenCalled();
    });

    it('still stores new chunks (without embeddings) when the provider has no generateEmbeddings', async () => {
      ragDocumentFindUnique
        .mockResolvedValueOnce({ id: 'doc-1', content: 'Old content.' })
        .mockResolvedValueOnce({
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          content: 'New content without an embedding provider.',
          status: 'DRAFT',
          updatedAt: new Date(),
          chunks: [],
        });
      ragChunkCreate.mockResolvedValue({ id: 'chunk-1' });
      const localProvider = {} as AiProvider;
      const service = makeService(localProvider);

      await service.update(
        'doc-1',
        { content: 'New content without an embedding provider.' },
        'admin-1',
      );

      expect(ragChunkCreate).toHaveBeenCalled();
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it('still stores new chunks when a real embedding call fails', async () => {
      ragDocumentFindUnique
        .mockResolvedValueOnce({ id: 'doc-1', content: 'Old content.' })
        .mockResolvedValueOnce({
          id: 'doc-1',
          category: 'WALKING_GUIDE',
          title: 'Walking',
          content: 'New content that fails to embed.',
          status: 'DRAFT',
          updatedAt: new Date(),
          chunks: [],
        });
      ragChunkCreate.mockResolvedValue({ id: 'chunk-1' });
      generateEmbeddings.mockRejectedValue(new Error('quota exceeded'));
      const service = makeService();

      await service.update(
        'doc-1',
        { content: 'New content that fails to embed.' },
        'admin-1',
      );

      expect(ragChunkCreate).toHaveBeenCalled();
      expect(executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('approve / unapprove', () => {
    it('flips DRAFT to APPROVED', async () => {
      ragDocumentUpdate.mockResolvedValue({ id: 'doc-1' });
      ragDocumentFindUnique.mockResolvedValue({
        id: 'doc-1',
        category: 'WALKING_GUIDE',
        title: 'Walking',
        content: 'x',
        status: 'APPROVED',
        updatedAt: new Date(),
        chunks: [],
      });
      const service = makeService();

      await service.approve('doc-1', 'admin-1');

      expect(ragDocumentUpdate).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'APPROVED' },
        select: { id: true },
      });
      expect(record).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'rag-document.approve',
        targetType: 'RagDocument',
        targetId: 'doc-1',
        metadata: { after: 'APPROVED' },
      });
    });

    it('flips APPROVED back to DRAFT', async () => {
      ragDocumentUpdate.mockResolvedValue({ id: 'doc-1' });
      ragDocumentFindUnique.mockResolvedValue({
        id: 'doc-1',
        category: 'WALKING_GUIDE',
        title: 'Walking',
        content: 'x',
        status: 'DRAFT',
        updatedAt: new Date(),
        chunks: [],
      });
      const service = makeService();

      await service.unapprove('doc-1', 'admin-1');

      expect(ragDocumentUpdate).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'DRAFT' },
        select: { id: true },
      });
    });

    it('throws NotFoundException for a missing document', async () => {
      ragDocumentUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.19.3',
        }),
      );
      const service = makeService();

      await expect(
        service.approve('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
