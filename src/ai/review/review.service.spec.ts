import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AiProvider } from '../ai-provider.interface';
import { MemoryService } from '../memory/memory.service';
import { ReviewService } from './review.service';

const timezone = 'Asia/Karachi';

function karachiNoon(date: string): Date {
  return new Date(`${date}T07:00:00.000Z`);
}

function createUser(overrides: Partial<{ profile: unknown }> = {}) {
  return {
    id: 'user-id',
    fullName: 'Haseeb',
    status: 'ACTIVE',
    deletedAt: null,
    profile: {
      timezone,
      gender: 'MALE',
      dateOfBirth: new Date('1995-01-01'),
      goalType: 'LOSE_WEIGHT',
      goalPace: 'BALANCED',
      activityLevel: 'MODERATELY_ACTIVE',
      currentWeightKg: new Prisma.Decimal('80'),
      targetWeightKg: new Prisma.Decimal('70'),
      calorieTarget: new Prisma.Decimal('2200'),
      proteinTargetGrams: new Prisma.Decimal('150'),
    },
    ...overrides,
  };
}

describe('ReviewService', () => {
  const userFindUnique = jest.fn();
  const weeklyReviewFindFirst = jest.fn();
  const weeklyReviewUpsert = jest.fn();
  const mealLogFindMany = jest.fn();
  const waterLogFindMany = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const weightLogFindMany = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    weeklyReview: {
      findFirst: weeklyReviewFindFirst,
      upsert: weeklyReviewUpsert,
    },
    mealLog: { findMany: mealLogFindMany },
    waterLog: { findMany: waterLogFindMany },
    exerciseLog: { findMany: exerciseLogFindMany },
    weightLog: { findMany: weightLogFindMany },
  } as unknown as PrismaService;
  const config = { get: jest.fn() };
  const retrieveRelevantMemories = jest.fn();
  const memoryService = {
    retrieveRelevantMemories,
  } as unknown as MemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(karachiNoon('2024-01-10')); // Wednesday
    userFindUnique.mockResolvedValue(createUser());
    weeklyReviewFindFirst.mockResolvedValue(null);
    weeklyReviewUpsert.mockImplementation(({ create }) =>
      Promise.resolve({ id: 'review-id', ...create }),
    );
    mealLogFindMany.mockResolvedValue([]);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    weightLogFindMany.mockResolvedValue([]);
    retrieveRelevantMemories.mockResolvedValue([]);
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'gemini';
      if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash';
      if (key === 'AI_TIMEOUT_MS') return '30000';

      return undefined;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildService(aiProvider: Partial<AiProvider>) {
    return new ReviewService(
      prisma,
      config as never,
      aiProvider as AiProvider,
      memoryService,
    );
  }

  function lastPersistedCreate(): {
    generatedByProvider: string | null;
    aiSummary: string | null;
  } {
    const [[{ create }]] = weeklyReviewUpsert.mock.calls as [
      [
        {
          create: {
            generatedByProvider: string | null;
            aiSummary: string | null;
          };
        },
      ],
    ];

    return create;
  }

  it('rejects generating a review for a week that has not ended yet', async () => {
    const service = buildService({});

    await expect(
      service.generate('user-id', '2024-01-10'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(weeklyReviewUpsert).not.toHaveBeenCalled();
  });

  it('persists a deterministic partial narrative and skips the AI call with fewer than 3 logged days', async () => {
    const generateWeeklyReview = jest.fn();
    mealLogFindMany.mockResolvedValue([
      {
        loggedAt: karachiNoon('2024-01-01'),
        totalCalories: new Prisma.Decimal('500'),
        totalProteinGrams: new Prisma.Decimal('20'),
      },
    ]);
    const service = buildService({ generateWeeklyReview });

    const result = await service.generate('user-id');

    expect(generateWeeklyReview).not.toHaveBeenCalled();
    expect(result.partial).toBe(true);
    expect(result.aiGenerated).toBe(false);
    expect(result.summary).toContain('enough logging');
    expect(result.nextWeekFocus.length).toBeGreaterThan(0);
    expect(weeklyReviewUpsert).toHaveBeenCalledTimes(1);
    const persisted = lastPersistedCreate();
    expect(persisted.generatedByProvider).toBeNull();
    expect(persisted.aiSummary).not.toBeNull();
  });

  it('calls the AI provider and persists its narrative when enough data exists', async () => {
    const generateWeeklyReview = jest.fn().mockResolvedValue({
      content: '{}',
      structured: {
        summary: 'Great consistency this week.',
        whatWorked: 'You logged every meal.',
        whatGotDifficult: 'Water was inconsistent.',
        nextWeekFocus: ['Drink more water', 'Keep logging meals'],
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });
    mealLogFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        loggedAt: karachiNoon(`2024-01-0${index + 1}`),
        totalCalories: new Prisma.Decimal('2000'),
        totalProteinGrams: new Prisma.Decimal('150'),
      })),
    );
    const service = buildService({ generateWeeklyReview });

    const result = await service.generate('user-id');

    expect(generateWeeklyReview).toHaveBeenCalledTimes(1);
    expect(retrieveRelevantMemories).toHaveBeenCalledWith(
      'user-id',
      'weekly progress patterns',
      4,
    );
    expect(result.partial).toBe(false);
    expect(result.aiGenerated).toBe(true);
    expect(result.summary).toBe('Great consistency this week.');
    expect(result.nextWeekFocus).toEqual([
      'Drink more water',
      'Keep logging meals',
    ]);
    const persisted = lastPersistedCreate();
    expect(persisted.generatedByProvider).toBe('gemini');
  });

  it('persists stats only (aiSummary: null) when the AI call fails', async () => {
    const generateWeeklyReview = jest
      .fn()
      .mockRejectedValue(new Error('AI provider is temporarily unavailable'));
    mealLogFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        loggedAt: karachiNoon(`2024-01-0${index + 1}`),
        totalCalories: new Prisma.Decimal('2000'),
        totalProteinGrams: new Prisma.Decimal('150'),
      })),
    );
    const service = buildService({ generateWeeklyReview });

    const result = await service.generate('user-id');

    expect(result.partial).toBe(false);
    expect(result.aiGenerated).toBe(false);
    expect(result.summary).toBeNull();
    expect(result.metrics.averageCalories).toBe(1428.6); // 5 days * 2000 kcal / 7
    const persisted = lastPersistedCreate();
    expect(persisted.aiSummary).toBeNull();
    expect(persisted.generatedByProvider).toBeNull();
  });

  it('persists stats only when the provider has no generateWeeklyReview capability', async () => {
    mealLogFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        loggedAt: karachiNoon(`2024-01-0${index + 1}`),
        totalCalories: new Prisma.Decimal('2000'),
        totalProteinGrams: new Prisma.Decimal('150'),
      })),
    );
    const service = buildService({});

    const result = await service.generate('user-id');

    expect(result.aiGenerated).toBe(false);
    expect(result.summary).toBeNull();
  });

  it('getLatest returns null when no review exists yet', async () => {
    const service = buildService({});

    const result = await service.getLatest('user-id');

    expect(result).toBeNull();
  });

  it('getLatest maps a persisted row back into the response shape', async () => {
    weeklyReviewFindFirst.mockResolvedValue({
      id: 'review-id',
      weekStartDate: new Date('2024-01-01T00:00:00.000Z'),
      weekEndDate: new Date('2024-01-07T00:00:00.000Z'),
      avgCalories: new Prisma.Decimal('2000'),
      avgProteinGrams: new Prisma.Decimal('150'),
      avgSteps: new Prisma.Decimal('4000'),
      avgWaterMl: new Prisma.Decimal('2500'),
      startWeightKg: new Prisma.Decimal('80'),
      endWeightKg: new Prisma.Decimal('78.5'),
      weightChangeKg: new Prisma.Decimal('-1.5'),
      consistencyRate: new Prisma.Decimal('71'),
      aiSummary: 'Solid week.',
      aiRecommendations: {
        whatWorked: 'Consistent meals.',
        whatGotDifficult: 'Water.',
        nextWeekFocus: ['Drink more water'],
        bestHabit: 'MEAL_LOGGING',
        weakestHabit: 'WATER_LOGGING',
        mealLoggingDays: 5,
        waterLoggingDays: 2,
        exerciseLoggingDays: 1,
        weightLoggingDays: 2,
        proteinTargetMetDays: 4,
        totalLoggingDays: 5,
        partial: false,
      },
      generatedByProvider: 'gemini',
      generatedAt: new Date('2024-01-08T00:00:00.000Z'),
      viewedAt: null,
      userId: 'user-id',
      createdAt: new Date('2024-01-08T00:00:00.000Z'),
      updatedAt: new Date('2024-01-08T00:00:00.000Z'),
    });
    const service = buildService({});

    const result = await service.getLatest('user-id');

    expect(result?.weekStart).toBe('2024-01-01');
    expect(result?.weekEnd).toBe('2024-01-07');
    expect(result?.summary).toBe('Solid week.');
    expect(result?.habits).toEqual({
      best: 'MEAL_LOGGING',
      weakest: 'WATER_LOGGING',
    });
    expect(result?.metrics.averageCalories).toBe(2000);
    expect(result?.metrics.weightChangeKg).toBe(-1.5);
  });
});
