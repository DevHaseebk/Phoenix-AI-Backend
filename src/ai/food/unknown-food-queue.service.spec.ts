import { PrismaService } from '../../prisma/prisma.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';

describe('UnknownFoodQueueService', () => {
  const upsert = jest.fn();
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const update = jest.fn();
  const prisma = {
    unknownFoodQueueItem: {
      upsert,
      findMany,
      findUnique,
      update,
    },
  } as unknown as PrismaService;

  const sampleEstimate = {
    intent: 'MEAL_ESTIMATE' as const,
    summary: 'Unusual dish',
    confidenceLevel: 'LOW' as const,
    confidenceScore: 0.4,
    mealType: null,
    items: [],
    totals: {
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      fiberGrams: null,
    },
    clarificationQuestions: [],
    assumptions: [],
    warnings: [],
    reply: 'Estimated as best I could.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts on the normalized text, incrementing frequency and lastSeenAt on repeat sightings', async () => {
    const service = new UnknownFoodQueueService(prisma);

    await service.recordSighting({
      normalizedText: 'some unusual dish',
      aiEstimate: sampleEstimate,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rawText: 'some unusual dish' },
        create: expect.objectContaining({
          rawText: 'some unusual dish',
          frequency: 1,
        }) as Record<string, unknown>,
        update: expect.objectContaining({
          frequency: { increment: 1 },
        }) as Record<string, unknown>,
      }),
    );
  });

  it('does not record an empty normalized text', async () => {
    const service = new UnknownFoodQueueService(prisma);

    await service.recordSighting({
      normalizedText: '',
      aiEstimate: sampleEstimate,
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('lists queue items sorted by frequency then recency, optionally filtered by status', async () => {
    findMany.mockResolvedValue([]);
    const service = new UnknownFoodQueueService(prisma);

    await service.list('PENDING');

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: [{ frequency: 'desc' }, { lastSeenAt: 'desc' }],
    });
  });

  it('sets status to APPROVED/REJECTED/NEEDS_RESEARCH for an existing item', async () => {
    findUnique.mockResolvedValue({ id: 'queue-1' });
    update.mockResolvedValue({ id: 'queue-1', status: 'REJECTED' });
    const service = new UnknownFoodQueueService(prisma);

    const result = await service.setStatus('queue-1', 'REJECTED');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'queue-1' },
      data: { status: 'REJECTED' },
    });
    expect(result?.status).toBe('REJECTED');
  });

  it('returns null when setting status on a queue item that does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const service = new UnknownFoodQueueService(prisma);

    const result = await service.setStatus('missing', 'REJECTED');

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
