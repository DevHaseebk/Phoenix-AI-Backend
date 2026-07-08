import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMemoryCategory, AiMemoryStatus } from '@prisma/client';
import { AiProvider } from '../ai-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { RAG_EMBEDDING_DIMENSION } from '../rag/rag.constants';
import { formatMemoryBlock, MemoryService } from './memory.service';

describe('MemoryService', () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const memoryFindFirst = jest.fn();
  const memoryFindMany = jest.fn();
  const memoryCreate = jest.fn();
  const memoryUpdate = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    aiMemory: {
      findFirst: memoryFindFirst,
      findMany: memoryFindMany,
      create: memoryCreate,
      update: memoryUpdate,
    },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = { AI_TIMEOUT_MS: '30000' };

      return values[key];
    }),
  } as unknown as ConfigService;
  const generateEmbeddings = jest.fn();
  const extractMemory = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    executeRaw.mockResolvedValue(undefined);
  });

  describe('retrieveRelevantMemories', () => {
    it('returns [] when the provider cannot embed', async () => {
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      expect(
        await service.retrieveRelevantMemories('user-id', 'query'),
      ).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns rows in similarity order scoped to the user', async () => {
      generateEmbeddings.mockResolvedValue([
        Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.05),
      ]);
      queryRaw.mockResolvedValue([
        {
          id: 'memory-1',
          category: AiMemoryCategory.BEHAVIORAL_PATTERN,
          content: 'Only walks in the evening.',
          confidence: 0.8,
          similarity: 0.93,
        },
        {
          id: 'memory-2',
          category: AiMemoryCategory.FOOD_PREFERENCE,
          content: 'Dislikes karela.',
          confidence: 0.7,
          similarity: 0.61,
        },
      ]);
      const provider = { generateEmbeddings } as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      const memories = await service.retrieveRelevantMemories(
        'user-id',
        'should I walk this morning?',
        2,
      );

      expect(generateEmbeddings).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'RETRIEVAL_QUERY' }),
      );
      expect(memories).toHaveLength(2);
      expect(memories[0].similarity).toBeGreaterThan(memories[1].similarity);
    });

    it('degrades to [] when embedding throws', async () => {
      generateEmbeddings.mockRejectedValue(new Error('provider down'));
      const provider = { generateEmbeddings } as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      expect(await service.retrieveRelevantMemories('user-id', 'x')).toEqual(
        [],
      );
    });
  });

  describe('extractAndSaveMemory', () => {
    it('does nothing when the provider cannot extract', async () => {
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await service.extractAndSaveMemory('user-id', 'USER: hi\nASSISTANT: hi');

      expect(memoryCreate).not.toHaveBeenCalled();
    });

    it('saves nothing for conversational filler (shouldSave: false)', async () => {
      extractMemory.mockResolvedValue({
        content: '{}',
        structured: {
          shouldSave: false,
          category: null,
          content: null,
          confidence: null,
          isUserVisible: true,
        },
        model: 'gemini-2.5-flash',
        latencyMs: 10,
      });
      const provider = { extractMemory } as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await service.extractAndSaveMemory(
        'user-id',
        'USER: thanks!\nASSISTANT: anytime',
      );

      expect(memoryCreate).not.toHaveBeenCalled();
    });

    it('saves a memory when confidently memory-worthy, and embeds it', async () => {
      extractMemory.mockResolvedValue({
        content: '{}',
        structured: {
          shouldSave: true,
          category: 'BEHAVIORAL_PATTERN',
          content: 'Only walks in the evening, never in the morning.',
          confidence: 0.85,
          isUserVisible: true,
        },
        model: 'gemini-2.5-flash',
        latencyMs: 10,
      });
      generateEmbeddings.mockResolvedValue([
        Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.02),
      ]);
      memoryCreate.mockResolvedValue({ id: 'memory-1' });
      const provider = {
        extractMemory,
        generateEmbeddings,
      } as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await service.extractAndSaveMemory(
        'user-id',
        'USER: main subah walk nahi karta, sirf raat ko\nASSISTANT: Got it.',
      );

      expect(memoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-id',
            category: 'BEHAVIORAL_PATTERN',
            content: 'Only walks in the evening, never in the morning.',
            confidence: 0.85,
            isUserVisible: true,
          }) as object,
        }),
      );
      expect(executeRaw).toHaveBeenCalled();
    });

    it('never throws when extraction itself fails', async () => {
      extractMemory.mockRejectedValue(new Error('provider down'));
      const provider = { extractMemory } as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await expect(
        service.extractAndSaveMemory('user-id', 'anything'),
      ).resolves.toBeUndefined();
      expect(memoryCreate).not.toHaveBeenCalled();
    });
  });

  describe('user-facing CRUD', () => {
    it('lists only visible, active memories', async () => {
      memoryFindMany.mockResolvedValue([]);
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await service.listVisibleMemories('user-id');

      expect(memoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-id',
            isUserVisible: true,
            status: AiMemoryStatus.ACTIVE,
          },
        }),
      );
    });

    it('rejects updating a memory owned by another user', async () => {
      memoryFindFirst.mockResolvedValue(null);
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await expect(
        service.updateMemoryContent('user-a', 'memory-owned-by-b', 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(memoryUpdate).not.toHaveBeenCalled();
    });

    it('rejects deleting a memory owned by another user', async () => {
      memoryFindFirst.mockResolvedValue(null);
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await expect(
        service.archiveMemory('user-a', 'memory-owned-by-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(memoryUpdate).not.toHaveBeenCalled();
    });

    it('updates content for an owned memory', async () => {
      memoryFindFirst.mockResolvedValue({ id: 'memory-1' });
      memoryUpdate.mockResolvedValue({
        id: 'memory-1',
        category: AiMemoryCategory.FOOD_PREFERENCE,
        content: 'Updated content',
        confidence: 0.7,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      const result = await service.updateMemoryContent(
        'user-1',
        'memory-1',
        'Updated content',
      );

      expect(memoryFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'memory-1',
            userId: 'user-1',
          }) as object,
        }),
      );
      expect(result.content).toBe('Updated content');
    });

    it('soft-deletes (archives) an owned memory instead of hard-deleting', async () => {
      memoryFindFirst.mockResolvedValue({ id: 'memory-1' });
      const provider = {} as unknown as AiProvider;
      const service = new MemoryService(prisma, config, provider);

      await service.archiveMemory('user-1', 'memory-1');

      expect(memoryUpdate).toHaveBeenCalledWith({
        where: { id: 'memory-1' },
        data: { status: AiMemoryStatus.ARCHIVED },
        select: { id: true },
      });
    });
  });

  it('formats memories with a category label per line', () => {
    const block = formatMemoryBlock([
      {
        id: 'memory-1',
        category: AiMemoryCategory.FOOD_PREFERENCE,
        content: 'Dislikes karela.',
        confidence: 0.8,
        similarity: 0.9,
      },
    ]);

    expect(block).toBe('[FOOD_PREFERENCE] Dislikes karela.');
  });
});
