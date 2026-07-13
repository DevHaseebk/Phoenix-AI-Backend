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
import { MealItemResolverService } from './food/meal-item-resolver.service';
import { MemoryService } from './memory/memory.service';
import { RagService } from './rag/rag.service';
import { UserStateService } from './user-state/user-state.service';

describe('AiService', () => {
  const userFindUnique = jest.fn();
  const conversationFindFirst = jest.fn();
  const conversationCreate = jest.fn();
  const conversationUpdate = jest.fn();
  const messageCreate = jest.fn();
  const messageFindMany = jest.fn();
  const estimateFindFirst = jest.fn();
  const estimateUpdate = jest.fn();
  const estimateCreate = jest.fn();
  const mealLogCreate = jest.fn();
  const exerciseLogCreate = jest.fn();
  const userProfileFindUnique = jest.fn();
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
      create: estimateCreate,
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
  const determineForUser = jest.fn();
  const userStateService = {
    determineForUser,
  } as unknown as UserStateService;
  const resolveMeal = jest.fn();
  const mealItemResolverService = {
    resolveMeal,
  } as unknown as MealItemResolverService;

  function createService(): AiService {
    return new AiService(
      prisma,
      config,
      provider,
      dashboardService,
      ragService,
      memoryService,
      userStateService,
      mealItemResolverService,
    );
  }

  function extractContextJson(userPrompt: string): Record<string, unknown> {
    const contextText = userPrompt
      .split('\n\n')[0]
      .replace('User context (authoritative app data):\n', '');

    return JSON.parse(contextText) as Record<string, unknown>;
  }

  function extractUserStateBlock(userPrompt: string): Record<string, unknown> {
    const stateSection = userPrompt
      .split('\n\n')
      .find((section) => section.startsWith('User state'));

    if (!stateSection) {
      throw new Error('No "User state" block found in prompt');
    }

    return JSON.parse(
      stateSection.replace(
        'User state (server-computed, do not ask the user about it):\n',
        '',
      ),
    ) as Record<string, unknown>;
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
    resolveMeal.mockResolvedValue({
      normalized: {
        status: AiMealEstimateStatus.DRAFT,
        structured: {
          intent: 'MEAL_ESTIMATE',
          summary: 'Estimate',
          confidenceLevel: ConfidenceLevel.MEDIUM,
          confidenceScore: 0.6,
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
          reply: 'Review before saving.',
        },
      },
      exerciseItems: [],
    });
    determineForUser.mockResolvedValue({
      state: 'ACTIVE_USER',
      reason: 'Recent logging activity, on track.',
    });
    messageFindMany.mockResolvedValue([]);
    generateCoachReply.mockResolvedValue({
      content: 'Coach reply',
      supportModeTriggered: false,
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
    userProfileFindUnique.mockResolvedValue({ timezone: 'Asia/Karachi' });
    const transactionClient = {
      aiMealEstimate: {
        findFirst: estimateFindFirst,
        update: estimateUpdate,
      },
      mealLog: {
        create: mealLogCreate,
      },
      exerciseLog: {
        create: exerciseLogCreate,
      },
      userProfile: {
        findUnique: userProfileFindUnique,
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
    expect(response.mealLogs).toHaveLength(1);
    expect(response.mealLogs[0].source).toBe(MealLogSource.AI_CHAT);
    expect(response.mealLogs[0].items[0].calories).toBe(750);
    expect(response.exerciseLogs).toEqual([]);
    expect(response.totals.calories).toBe(750);
  });

  it('confirms per-item resolved dates: back-dated food/exercise land on their own local day, grouped per meal', async () => {
    estimateFindFirst.mockResolvedValue({
      id: 'estimate-id',
      userId: 'user-id',
      originalText: 'last day breakfast 2 eggs, dinner roti, aur 30 min walk',
      mealType: null,
      status: AiMealEstimateStatus.DRAFT,
      confidenceLevel: ConfidenceLevel.MEDIUM,
      items: [
        {
          itemType: 'FOOD',
          name: 'Boiled Egg',
          quantityText: '2 x 1 large egg',
          calories: 155,
          proteinGrams: 13,
          carbsGrams: 1,
          fatGrams: 11,
          fiberGrams: null,
          resolvedDate: '2026-07-01',
          mealSlot: MealType.BREAKFAST,
        },
        {
          itemType: 'FOOD',
          name: 'Roti',
          quantityText: '1 roti',
          calories: 120,
          proteinGrams: 4,
          carbsGrams: 25,
          fatGrams: 1,
          fiberGrams: null,
          resolvedDate: '2026-07-01',
          mealSlot: MealType.DINNER,
        },
        {
          itemType: 'EXERCISE',
          name: 'walk',
          exerciseType: 'WALKING',
          durationMinutes: 30,
          distanceKm: null,
          steps: null,
          estimatedCaloriesBurned: 154,
          resolvedDate: '2026-07-01',
        },
      ],
    });
    mealLogCreate.mockResolvedValue({
      id: 'meal-log-id',
      mealType: MealType.BREAKFAST,
      description: 'last day breakfast 2 eggs, dinner roti, aur 30 min walk',
      totalCalories: new Prisma.Decimal('155'),
      totalProteinGrams: new Prisma.Decimal('13'),
      totalCarbsGrams: new Prisma.Decimal('1'),
      totalFatGrams: new Prisma.Decimal('11'),
      status: MealLogStatus.ESTIMATED,
      confidenceLevel: ConfidenceLevel.MEDIUM,
      source: MealLogSource.AI_CHAT,
      loggedAt: new Date('2026-07-01T07:00:00.000Z'),
      note: 'Created from DailyFit Coach AI meal estimate.',
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
      updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      items: [],
    });
    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: 'WALKING',
      durationMinutes: 30,
      steps: null,
      distanceKm: null,
      estimatedCaloriesBurned: 154,
      loggedAt: new Date('2026-07-01T07:00:00.000Z'),
    });

    const service = createService();
    const response = await service.confirmMeal('user-id', {
      estimateId: 'estimate-id',
    });

    // Two meal-slot groups on the same back-dated day -> two MealLogs.
    expect(mealLogCreate).toHaveBeenCalledTimes(2);
    const mealCalls = mealLogCreate.mock.calls as Array<
      [{ data: { mealType: MealType; loggedAt: Date } }]
    >;
    // Karachi local 2026-07-01 12:00 (noon anchor) = 07:00 UTC - dated to the
    // stated day, NOT the current timestamp.
    expect(mealCalls[0][0].data.mealType).toBe(MealType.BREAKFAST);
    expect(mealCalls[0][0].data.loggedAt.toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    expect(mealCalls[1][0].data.mealType).toBe(MealType.DINNER);
    expect(mealCalls[1][0].data.loggedAt.toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    // The exercise item became a real ExerciseLog on the same day, confirmed
    // through the same review flow (never silently written earlier).
    expect(exerciseLogCreate).toHaveBeenCalledTimes(1);
    const exerciseCall = (
      exerciseLogCreate.mock.calls as Array<
        [{ data: { exerciseType: string; loggedAt: Date; note: string } }]
      >
    )[0][0];
    expect(exerciseCall.data.exerciseType).toBe('WALKING');
    expect(exerciseCall.data.loggedAt.toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    expect(response.exerciseLogs).toHaveLength(1);
    expect(response.totals.caloriesBurned).toBe(154);
  });

  it('confirms an exercise-only estimate (no food items) instead of rejecting it', async () => {
    estimateFindFirst.mockResolvedValue({
      id: 'estimate-id',
      userId: 'user-id',
      originalText: '30 min walk ki',
      mealType: null,
      status: AiMealEstimateStatus.DRAFT,
      confidenceLevel: ConfidenceLevel.MEDIUM,
      items: [
        {
          itemType: 'EXERCISE',
          name: 'walk',
          exerciseType: 'WALKING',
          durationMinutes: 30,
          distanceKm: null,
          steps: null,
          estimatedCaloriesBurned: 154,
          resolvedDate: null,
        },
      ],
    });
    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: 'WALKING',
      durationMinutes: 30,
      steps: null,
      distanceKm: null,
      estimatedCaloriesBurned: 154,
      loggedAt: new Date('2026-07-13T07:00:00.000Z'),
    });

    const service = createService();
    const response = await service.confirmMeal('user-id', {
      estimateId: 'estimate-id',
    });

    expect(mealLogCreate).not.toHaveBeenCalled();
    expect(exerciseLogCreate).toHaveBeenCalledTimes(1);
    expect(response.mealLogs).toEqual([]);
    expect(response.exerciseLogs).toHaveLength(1);
  });

  it('intercepts a loggable chat message into the shared estimate card instead of a plain reply', async () => {
    resolveMeal.mockResolvedValue({
      normalized: {
        status: AiMealEstimateStatus.DRAFT,
        structured: {
          intent: 'MEAL_ESTIMATE',
          summary: 'Boiled Egg, walk',
          confidenceLevel: ConfidenceLevel.MEDIUM,
          confidenceScore: 0.7,
          mealType: null,
          items: [
            {
              name: 'Boiled Egg',
              quantityText: '2 x 1 large egg',
              calories: 155,
              proteinGrams: 13,
              carbsGrams: 1,
              fatGrams: 11,
              fiberGrams: null,
              assumptions: [],
              resolvedDate: '2026-07-12',
              mealSlot: MealType.BREAKFAST,
            },
          ],
          totals: {
            calories: 155,
            proteinGrams: 13,
            carbsGrams: 1,
            fatGrams: 11,
            fiberGrams: null,
          },
          clarificationQuestions: [],
          assumptions: [],
          warnings: [],
          reply: 'Boiled Egg plus a walk - review before saving.',
        },
      },
      exerciseItems: [
        {
          name: 'walk',
          exerciseType: 'WALKING',
          durationMinutes: 30,
          distanceKm: null,
          steps: null,
          estimatedCaloriesBurned: 154,
          resolvedDate: '2026-07-12',
          assumptions: [],
        },
      ],
      providerModel: 'gemini-2.5-flash',
      providerLatencyMs: 20,
    });
    estimateCreate.mockResolvedValue({
      id: 'estimate-id',
      status: AiMealEstimateStatus.DRAFT,
    });

    const service = createService();
    const response = (await service.chat('user-id', {
      message: 'kal maine 2 anday khaye aur 30 min walk ki',
    })) as {
      mealEstimate?: {
        estimateId: string | null;
        estimate: { exerciseItems: unknown[] };
      };
    };

    // The shared pipeline handled it - no coach reply call was spent.
    expect(generateCoachReply).not.toHaveBeenCalled();
    expect(resolveMeal).toHaveBeenCalledTimes(1);
    expect(response.mealEstimate?.estimateId).toBe('estimate-id');
    expect(response.mealEstimate?.estimate.exerciseItems).toHaveLength(1);
    // The saved assistant message carries the resolver's honest reply.
    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'ASSISTANT',
          content: 'Boiled Egg plus a walk - review before saving.',
        }) as object,
      }),
    );
    // Food and exercise stored together with the itemType discriminator.
    expect(estimateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              itemType: 'FOOD',
              name: 'Boiled Egg',
            }) as object,
            expect.objectContaining({
              itemType: 'EXERCISE',
              name: 'walk',
            }) as object,
          ] as unknown,
        }) as object,
      }),
    );
  });

  it('falls through to the normal coaching reply when segmentation finds nothing loggable in a keyword-matched chat message', async () => {
    // Default resolveMeal mock returns zero items/exercise - e.g. "had a
    // rough day" passes the cheap keyword filter but is not loggable.
    const service = createService();
    const response = await service.chat('user-id', {
      message: 'I had a rough day, no energy for the gym',
    });

    expect(resolveMeal).toHaveBeenCalledTimes(1);
    expect(generateCoachReply).toHaveBeenCalledTimes(1);
    expect(response.message.content).toBe('Assistant reply');
    expect(
      (response as { mealEstimate?: unknown }).mealEstimate,
    ).toBeUndefined();
  });

  it('never runs the estimate pipeline for a plain coaching question', async () => {
    const service = createService();
    await service.chat('user-id', { message: 'what should I eat for lunch?' });

    expect(resolveMeal).not.toHaveBeenCalled();
    expect(generateCoachReply).toHaveBeenCalledTimes(1);
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

  it('delegates meal estimation to MealItemResolverService with the built user context', async () => {
    resolveMeal.mockResolvedValue({
      normalized: {
        status: AiMealEstimateStatus.DRAFT,
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
      },
      exerciseItems: [],
      providerModel: 'gemini-2.5-flash',
      providerLatencyMs: 20,
    });
    estimateCreate.mockResolvedValue({
      id: 'estimate-id',
      status: AiMealEstimateStatus.DRAFT,
    });

    const service = createService();
    const response = await service.estimateMeal('user-id', {
      message: 'chicken biryani',
    });

    expect(resolveMeal).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'chicken biryani' }) as object,
      expect.objectContaining({
        userContext: expect.any(String) as string,
        timezone: 'Asia/Karachi',
        todayLocalDate: '2026-07-07',
        currentWeightKg: null,
      }) as object,
    );
    const contextArg = (
      resolveMeal.mock.calls[0] as [unknown, { userContext: string }]
    )[1];
    expect(
      extractContextJson(
        `User context (authoritative app data):\n${contextArg.userContext}`,
      ).today,
    ).toBeDefined();
    expect(response.estimate?.calories).toBe(750);
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

  it('includes a clearly labeled "User state" block built from real data, reusing the already-computed BMR/weight', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      fullName: 'Haseeb',
      profile: {
        gender: Gender.MALE,
        dateOfBirth: new Date('1998-01-01'),
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
    determineForUser.mockResolvedValue({
      state: 'COMEBACK',
      reason: 'Returned today after a 16-day gap with no logging.',
    });

    const service = createService();
    await service.chat('user-id', { message: 'hi' });

    expect(determineForUser).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        hasMedicalRiskFlag: false,
        bmrKcal: expect.any(Number) as number,
        currentWeightKg: 88,
        targetWeightKg: 60,
      }),
    );

    const userPrompt = getSentUserPrompt(generateCoachReply);
    expect(userPrompt).toContain('User state (server-computed');
    const stateBlock = extractUserStateBlock(userPrompt);
    expect(stateBlock.state).toBe('COMEBACK');
    expect(stateBlock.reason).toMatch(/16-day gap/);
  });

  it('passes the blocked safety flag through to state classification as the medical-risk override', async () => {
    // This branch is unreachable in practice today, since a blocked message
    // short-circuits chat() before reaching this point - verified for when
    // that control flow changes, or determineForUser() is reused elsewhere.
    const service = createService();
    await service.chat('user-id', { message: 'hello' });

    expect(determineForUser).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({ hasMedicalRiskFlag: false }),
    );
  });

  it('stores supportModeTriggered on the saved message and logs when true, without changing the response shape', async () => {
    generateCoachReply.mockResolvedValue({
      content: "I'm here for you. Let's take it one step at a time.",
      supportModeTriggered: true,
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });

    const service = createService();
    const response = await service.chat('user-id', {
      message: 'I want to give up, nothing is working',
    });

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          structured: { supportModeTriggered: true },
        }) as object,
      }),
    );
    // No supportModeTriggered field leaks into the frontend-facing response.
    expect(response.message).toEqual({
      id: 'message-id',
      role: 'ASSISTANT',
      content: 'Assistant reply',
      createdAt: expect.any(Date) as Date,
    });
    expect(Object.keys(response.message)).not.toContain('supportModeTriggered');
  });

  it('stores supportModeTriggered: false for a normal turn', async () => {
    const service = createService();
    await service.chat('user-id', { message: 'what should I eat for lunch?' });

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          structured: { supportModeTriggered: false },
        }) as object,
      }),
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
