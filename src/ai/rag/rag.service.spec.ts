import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../ai-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { RAG_EMBEDDING_DIMENSION } from './rag.constants';
import { formatKnowledgeBlock, RagService } from './rag.service';

describe('RagService', () => {
  const queryRaw = jest.fn();
  const generateEmbeddings = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'development',
        AI_TIMEOUT_MS: '30000',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns [] and skips the database when the provider cannot embed', async () => {
    const providerWithoutEmbeddings = {} as unknown as AiProvider;
    const service = new RagService(prisma, config, providerWithoutEmbeddings);

    const chunks = await service.retrieveRelevantChunks('plateau question');

    expect(chunks).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns top-k rows in similarity order from the vector query', async () => {
    generateEmbeddings.mockResolvedValue([
      Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.1),
    ]);
    queryRaw.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Plateaus are normal.',
        category: 'PLATEAU_HANDLING',
        title: 'Plateau Guide',
        similarity: 0.91,
      },
      {
        id: 'chunk-2',
        content: 'Weigh at the same time daily.',
        category: 'PLATEAU_HANDLING',
        title: 'Plateau Guide',
        similarity: 0.84,
      },
    ]);

    const provider = { generateEmbeddings } as unknown as AiProvider;
    const service = new RagService(prisma, config, provider);
    const chunks = await service.retrieveRelevantChunks('scale stuck', 2);

    expect(generateEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: ['scale stuck'],
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: RAG_EMBEDDING_DIMENSION,
      }),
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].id).toBe('chunk-1');
    expect(chunks[0].similarity).toBeGreaterThan(chunks[1].similarity);
  });

  it('returns [] when the embedding has the wrong dimension', async () => {
    generateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);

    const provider = { generateEmbeddings } as unknown as AiProvider;
    const service = new RagService(prisma, config, provider);

    expect(await service.retrieveRelevantChunks('anything')).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('degrades to [] when embedding or query throws', async () => {
    generateEmbeddings.mockRejectedValue(new Error('provider down'));

    const provider = { generateEmbeddings } as unknown as AiProvider;
    const service = new RagService(prisma, config, provider);

    expect(await service.retrieveRelevantChunks('anything')).toEqual([]);
  });

  it('formats retrieved chunks with category/title labels', () => {
    const block = formatKnowledgeBlock([
      {
        id: 'chunk-1',
        content: 'Plateaus are normal.',
        category: 'PLATEAU_HANDLING',
        title: 'Plateau Guide',
        similarity: 0.9,
      },
    ]);

    expect(block).toBe(
      '[PLATEAU_HANDLING | Plateau Guide]\nPlateaus are normal.',
    );
  });
});
