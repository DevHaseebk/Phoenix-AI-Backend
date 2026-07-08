import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityLevel,
  AiMealEstimateStatus,
  ConfidenceLevel,
  Gender,
  GoalPace,
  GoalType,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import {
  calculateBmr,
  calculateTdee,
} from '../common/utils/health-metrics.util';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvider } from './ai-provider.interface';
import { AiService } from './ai.service';
import { MemoryService } from './memory/memory.service';
import { RagService } from './rag/rag.service';

describe('AiService', () => {
  const userFindUnique = jest.fn();
  const conversationFindFirst = jest.fn();
  const conversationCreate = jest.fn();
  const conversationUpdate = jest.fn();
  const messageCreate = jest.fn();
  const messageFindMany = jest.fn();
  const estimateFindFirst = jest.fn();
  const estimateUpdate = jest.fn();
  const mealLogCreate = jest.fn();
  const transaction = jest.fn();
  const generateCoachReply = jest.fn();
  const generateMealEstimate = jest.fn();
  const prisma = {
    $transaction: transaction,
    user: { findUnique: userFindUnique },
    aiConversation: {
      findFirst: conversationFindFirst,
      create: conversationCreate,
      update: conversationUpdate,
      findMany: jest.fn(),
    },
    aiMessage: { create: messageCreate, findMany: messageFindMany },
    aiMealEstimate: {
      findFirst: estimateFindFirst,
      update: estimateUpdate,
      create: jest.fn(),
    },
    mealLog: { create: mealLogCreate },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        GEMINI_MODEL: 'gemini-2.5-flash',
        AI_TIMEOUT_MS: '30000',
      };

      return values[key];
    }),
  } as unknown as ConfigService;
  const provider = {
    generateCoachReply,
    generateMealEstimate,
  } as unknown as AiProvider;
  const dashboardGetToday = jest.fn();
  const dashboardService = {
    getToday: dashboardGetToday,
  } as unknown as DashboardService;
  const retrieveRelevantChunks = jest.fn();
  const ragService = {
    retrieveRelevantChunks,
  } as unknown as RagService;
  const retrieveRelevantMemories = jest.fn();
  const extractAndSaveMemory = jest.fn();
  const memoryService = {
    retrieveRelevantMemories,
    extractAndSaveMemory,
  } as unknown as MemoryService;

  function createService(): AiService {
    return new AiService(
      prisma,
      config,
      provider,
      dashboardService,
      ragService,
      memoryService,
    );
  }

  function extractContextJson(userPrompt: string): Record<string, unknown> {
    const contextText = userPrompt
      .split(/\n\n(?:User message|Meal request):/)[0]
      .replace('User context (authoritative app data):\n', '');

    return JSON.parse(contextText) as Record<string, unknown>;
  }

  function getSentUserPrompt(mockFn: jest.Mock): string {
    const calls = mockFn.mock.calls as Array<[{ userPrompt: string }]>;

    return calls[0][0].userPrompt;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      fullName: 'Haseeb',
      profile: null,
      onboarding: null,
      weightLogs: [],
      mealLogs: [],
    });
    dashboardGetToday.mockResolvedValue(
      buildTodayResponse({
        caloriesConsumed: 0,
        calorieTarget: null,
        caloriesRemaining: null,
      }),
    );
    retrieveRelevantChunks.mockResolvedValue([]);
    retrieveRelevantMemories.mockResolvedValue([]);
    extractAndSaveMemory.mockResolvedValue(undefined);
    messageFindMany.mockResolvedValue([]);
    generateCoachReply.mockResolvedValue({
      content: 'Coach reply',
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });
    conversationCreate.mockResolvedValue({
      id: 'conversation-id',
      type: 'MEAL_LOGGING',
      status: 'ACTIVE',
    });
    conversationUpdate.mockResolvedValue({ id: 'conversation-id' });
    messageCreate.mockResolvedValue({
      id: 'message-id',
      role: 'ASSISTANT',
      content: 'Assistant reply',
      createdAt: new Date('2026-07-07T10:00:00.000Z'),
    });
    const transactionClient = {
      aiMealEstimate: {
        findFirst: estimateFindFirst,
        update: estimateUpdate,
      },
      mealLog: {
        create: mealLogCreate,
      },
    };
    transaction.mockImplementation(
      (
        callback: (
          transactionClientArg: typeof transactionClient,
        ) => Promise<unknown>,
      ) => callback(transactionClient),
    );
  });

  it('short-circuits unsafe chat prompts and stores a safety response', async () => {
    const service = createService();
    const response = await service.chat('user-id', {
      message: 'Can I eat 500 calories and use ozempic dose?',
    });

    expect(generateCoachReply).not.toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'ASSISTANT',
          safetyFlags: expect.objectContaining({
            blocked: true,
          }) as object,
        }) as object,
      }),
    );
    expect(response.safetyFlags.blocked).toBe(true);
  });

  it('confirms an owned AI meal estimate into a MealLog', async () => {
    const createdAt = new Date('2026-07-07T10:00:00.000Z');
    const loggedAt = new Date('2026-07-07T09:00:00.000Z');
    const updatedAt = new Date('2026-07-07T10:00:00.000Z');

    estimateFindFirst.mockResolvedValue({
      id: 'estimate-id',
      userId: 'user-id',
      originalText: 'Chicken biryani',
      mealType: MealType.LUNCH,
      status: AiMealEstimateStatus.DRAFT,
      confidenceLevel: ConfidenceLevel.HIGH,
      items: [
        {
          name: 'Chicken Biryani',
          quantityText: 'medium plate',
          calories: 750,
          proteinGrams: 35,
          carbsGrams: 85,
          fatGrams: 28,
          fiberGrams: 4,
        },
      ],
    });
    mealLogCreate.mockResolvedValue({
      id: 'meal-log-id',
      mealType: MealType.LUNCH,
      description: 'Chicken biryani',
      totalCalories: new Prisma.Decimal('750'),
      totalProteinGrams: new Prisma.Decimal('35'),
      totalCarbsGrams: new Prisma.Decimal('85'),
      totalFatGrams: new Prisma.Decimal('28'),
      status: MealLogStatus.ESTIMATED,
      confidenceLevel: ConfidenceLevel.HIGH,
      source: MealLogSource.AI_CHAT,
      loggedAt,
      note: 'Created from DailyFit Coach AI meal estimate.',
      createdAt,
      updatedAt,
      items: [
        {
          id: 'meal-item-id',
          foodName: 'Chicken Biryani',
          portionLabel: 'medium plate',
          quantity: null,
          calories: new Prisma.Decimal('750'),
          proteinGrams: new Prisma.Decimal('35'),
          carbsGrams: new Prisma.Decimal('85'),
          fatGrams: new Prisma.Decimal('28'),
          confidenceLevel: ConfidenceLevel.HIGH,
          createdAt,
          updatedAt,
        },
      ],
    });

    const service = createService();
    const response = await service.confirmMeal('user-id', {
      estimateId: 'estimate-id',
      corrections: { loggedAt: loggedAt.toISOString() },
    });

    expect(mealLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-id',
          source: MealLogSource.AI_CHAT,
          status: MealLogStatus.ESTIMATED,
          totalCalories: 750,
          items: {
            create: [
              expect.objectContaining({
                foodName: 'Chicken Biryani',
                calories: 750,
              }) as object,
            ],
          },
        }) as object,
      }),
    );
    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: 'estimate-id' },
      data: {
        status: AiMealEstimateStatus.CONFIRMED,
        confirmedAt: expect.any(Date) as Date,
        mealLogId: 'meal-log-id',
      },
      select: { id: true },
    });
    expect(response.source).toBe(MealLogSource.AI_CHAT);
    expect(response.items[0].calories).toBe(750);
  });

  it('rejects confirming another user or missing estimate', async () => {
    estimateFindFirst.mockResolvedValue(null);

    const service = createService();

    await expect(
      service.confirmMeal('user-id', { estimateId: 'other-estimate-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  it('includes precomputed BMR/TDEE in the coach context for a full profile', async () => {
    const dateOfBirth = new Date('1998-01-01');
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      fullName: 'Haseeb',
      profile: {
        gender: Gender.MALE,
        dateOfBirth,
        heightCm: new Prisma.Decimal('188'),
        currentWeightKg: new Prisma.Decimal('88'),
        targetWeightKg: new Prisma.Decimal('60'),
        goalType: GoalType.LOSE_WEIGHT,
        goalPace: GoalPace.BALANCED,
        activityLevel: ActivityLevel.SEDENTARY,
        calorieTarget: new Prisma.Decimal('1800'),
        proteinTargetGrams: new Prisma.Decimal('96'),
      },
      onboarding: { status: 'COMPLETED' },
      weightLogs: [],
      mealLogs: [],
    });

    const service = createService();
    await service.chat('user-id', { message: 'mera bmr kia hai?' });

    const context = extractContextJson(getSentUserPrompt(generateCoachReply));
    const healthMetrics = context.healthMetrics as {
      bmrKcal: number;
      tdeeKcal: number;
      missingFields: string[];
    };
    const expectedBmr = calculateBmr({
      gender: Gender.MALE,
      dateOfBirth,
      heightCm: 188,
      weightKg: 88,
    });

    expect(healthMetrics.bmrKcal).toBe(Math.round(expectedBmr));
    expect(healthMetrics.tdeeKcal).toBe(
      Math.round(calculateTdee(expectedBmr, ActivityLevel.SEDENTARY)),
    );
    expect(healthMetrics.missingFields).toEqual([]);
    expect((context.profile as { heightCm: number }).heightCm).toBe(188);
    expect((context.profile as { gender: string }).gender).toBe('MALE');
  });

  it('flags only the specific missing profile fields instead of computing', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      fullName: 'Haseeb',
      profile: {
        gender: Gender.MALE,
        dateOfBirth: new Date('1998-01-01'),
        heightCm: null,
        currentWeightKg: new Prisma.Decimal('88'),
        targetWeightKg: new Prisma.Decimal('60'),
        goalType: GoalType.LOSE_WEIGHT,
        goalPace: GoalPace.BALANCED,
        activityLevel: ActivityLevel.SEDENTARY,
        calorieTarget: new Prisma.Decimal('1800'),
        proteinTargetGrams: new Prisma.Decimal('96'),
      },
      onboarding: { status: 'COMPLETED' },
      weightLogs: [],
      mealLogs: [],
    });

    const service = createService();
    await service.chat('user-id', { message: 'what is my bmr?' });

    const healthMetrics = extractContextJson(
      getSentUserPrompt(generateCoachReply),
    ).healthMetrics as {
      bmrKcal: number | null;
      tdeeKcal: number | null;
      missingFields: string[];
    };

    expect(healthMetrics.bmrKcal).toBeNull();
    expect(healthMetrics.tdeeKcal).toBeNull();
    expect(healthMetrics.missingFields).toEqual(['heightCm']);
  });

  it("includes today's aggregated activity from the dashboard service", async () => {
    dashboardGetToday.mockResolvedValue(
      buildTodayResponse({
        caloriesConsumed: 750,
        calorieTarget: 1800,
        caloriesRemaining: 1050,
      }),
    );

    const service = createService();
    await service.chat('user-id', { message: 'how many calories left today?' });

    expect(dashboardGetToday).toHaveBeenCalledWith('user-id');

    const today = extractContextJson(getSentUserPrompt(generateCoachReply))
      .today as {
      caloriesConsumed: number;
      caloriesRemaining: number;
      waterConsumedMl: number;
    };

    expect(today.caloriesConsumed).toBe(750);
    expect(today.caloriesRemaining).toBe(1050);
    expect(today.waterConsumedMl).toBe(500);
  });

  it('includes the user context in meal estimate prompts', async () => {
    generateMealEstimate.mockResolvedValue({
      content: '{}',
      structured: {
        intent: 'MEAL_ESTIMATE',
        summary: 'Estimate',
        confidenceLevel: ConfidenceLevel.MEDIUM,
        confidenceScore: 0.6,
        mealType: MealType.LUNCH,
        items: [
          {
            name: 'Chicken Biryani',
            quantityText: 'medium plate',
            calories: 750,
            proteinGrams: 35,
            carbsGrams: 85,
            fatGrams: 28,
            fiberGrams: 4,
            assumptions: [],
          },
        ],
        totals: {
          calories: 750,
          proteinGrams: 35,
          carbsGrams: 85,
          fatGrams: 28,
          fiberGrams: 4,
        },
        clarificationQuestions: [],
        assumptions: [],
        warnings: [],
        reply: 'Review before saving.',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 20,
    });
    (prisma.aiMealEstimate.create as unknown as jest.Mock).mockResolvedValue({
      id: 'estimate-id',
      status: AiMealEstimateStatus.DRAFT,
    });

    const service = createService();
    await service.estimateMeal('user-id', { message: 'chicken biryani' });

    const userPrompt = getSentUserPrompt(generateMealEstimate);

    expect(userPrompt).toContain('User context (authoritative app data):');
    expect(userPrompt).toContain('Meal request:');
    expect(extractContextJson(userPrompt).today).toBeDefined();
  });

  it('sends a bounded, truncated conversation-history window with chat', async () => {
    conversationFindFirst.mockResolvedValue({
      id: 'conversation-id',
      type: 'COACHING',
      status: 'ACTIVE',
    });
    // findMany is queried newest-first (desc); the service reverses to oldest-first.
    messageFindMany.mockResolvedValue([
      { role: 'USER', content: `biryani ${'x'.repeat(600)}` },
      { role: 'ASSISTANT', content: 'How was your lunch?' },
    ]);

    const service = createService();
    await service.chat('user-id', {
      conversationId: '2f8f1d41-7b0b-4c2d-88b0-0dfef518a708',
      message: 'was that too much?',
    });

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    );

    const userPrompt = getSentUserPrompt(generateCoachReply);

    expect(userPrompt).toContain('Recent conversation (oldest first):');
    // Oldest first after reversing the desc query result.
    expect(userPrompt.indexOf('USER: biryani')).toBeGreaterThan(
      userPrompt.indexOf('ASSISTANT: How was your lunch?'),
    );
    // 600-char message truncated to 500 + ellipsis.
    expect(userPrompt).toContain(`biryani ${'x'.repeat(492)}...`);
    expect(userPrompt).not.toContain('x'.repeat(600));
  });

  it('includes retrieved knowledge chunks in the chat prompt', async () => {
    retrieveRelevantChunks.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Plateaus of one to two weeks usually need no change.',
        category: 'PLATEAU_HANDLING',
        title: 'Plateau Guide',
        similarity: 0.9,
      },
    ]);

    const service = createService();
    await service.chat('user-id', { message: 'my weight is stuck' });

    expect(retrieveRelevantChunks).toHaveBeenCalledWith(
      'my weight is stuck',
      4,
    );

    const userPrompt = getSentUserPrompt(generateCoachReply);

    expect(userPrompt).toContain('Coaching knowledge');
    expect(userPrompt).toContain('[PLATEAU_HANDLING | Plateau Guide]');
    expect(userPrompt).toContain('usually need no change');
  });

  it('omits the knowledge block when nothing is retrieved', async () => {
    const service = createService();
    await service.chat('user-id', { message: 'hello' });

    expect(getSentUserPrompt(generateCoachReply)).not.toContain(
      'Coaching knowledge',
    );
  });

  it('includes retrieved memories as "Known patterns", separate from RAG knowledge', async () => {
    retrieveRelevantMemories.mockResolvedValue([
      {
        id: 'memory-1',
        category: 'BEHAVIORAL_PATTERN',
        content: 'Only walks in the evening, never in the morning.',
        confidence: 0.85,
        similarity: 0.9,
      },
    ]);

    const service = createService();
    await service.chat('user-id', { message: 'should I walk now?' });

    expect(retrieveRelevantMemories).toHaveBeenCalledWith(
      'user-id',
      'should I walk now?',
      4,
    );

    const userPrompt = getSentUserPrompt(generateCoachReply);

    expect(userPrompt).toContain('Known patterns about this user');
    expect(userPrompt).toContain('[BEHAVIORAL_PATTERN]');
    expect(userPrompt).toContain('Only walks in the evening');
  });

  it('omits the "Known patterns" block when no memories are retrieved', async () => {
    const service = createService();
    await service.chat('user-id', { message: 'hello' });

    expect(getSentUserPrompt(generateCoachReply)).not.toContain(
      'Known patterns about this user',
    );
  });

  it('fires memory extraction after the reply, without blocking the response', async () => {
    const service = createService();
    const response = await service.chat('user-id', {
      message: 'main subah walk nahi karta, sirf raat ko',
    });

    expect(response.message.content).toBe('Assistant reply');
    expect(extractAndSaveMemory).toHaveBeenCalledWith(
      'user-id',
      expect.stringContaining('main subah walk nahi karta'),
    );
    expect(extractAndSaveMemory).toHaveBeenCalledWith(
      'user-id',
      expect.stringContaining('ASSISTANT: Coach reply'),
    );
  });

  it('rejects non-confirmable estimates without items', async () => {
    estimateFindFirst.mockResolvedValue({
      id: 'estimate-id',
      userId: 'user-id',
      originalText: 'hello',
      mealType: null,
      status: AiMealEstimateStatus.NEEDS_CLARIFICATION,
      confidenceLevel: ConfidenceLevel.LOW,
      items: [],
    });

    const service = createService();

    await expect(
      service.confirmMeal('user-id', { estimateId: 'estimate-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  function buildTodayResponse(input: {
    caloriesConsumed: number;
    calorieTarget: number | null;
    caloriesRemaining: number | null;
  }) {
    return {
      date: '2026-07-07',
      timezone: 'Asia/Karachi',
      todayProgress: {
        calories: {
          consumed: input.caloriesConsumed,
          target: input.calorieTarget,
          remaining: input.caloriesRemaining,
        },
        protein: {
          consumedGrams: 35,
          targetGrams: 96,
          remainingGrams: 61,
        },
        water: {
          consumedMl: 500,
          targetMl: 3000,
          remainingMl: 2500,
        },
        steps: { count: 0, target: 8000, remaining: 8000 },
        exercise: { durationMinutes: 0, estimatedCaloriesBurned: 0 },
      },
    };
  }
});
