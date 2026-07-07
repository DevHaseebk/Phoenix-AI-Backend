import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiMealEstimateStatus,
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvider } from './ai-provider.interface';
import { AiService } from './ai.service';

describe('AiService', () => {
  const userFindUnique = jest.fn();
  const conversationFindFirst = jest.fn();
  const conversationCreate = jest.fn();
  const conversationUpdate = jest.fn();
  const messageCreate = jest.fn();
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
    aiMessage: { create: messageCreate },
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
    const service = new AiService(prisma, config, provider);
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

    const service = new AiService(prisma, config, provider);
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

    const service = new AiService(prisma, config, provider);

    await expect(
      service.confirmMeal('user-id', { estimateId: 'other-estimate-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mealLogCreate).not.toHaveBeenCalled();
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

    const service = new AiService(prisma, config, provider);

    await expect(
      service.confirmMeal('user-id', { estimateId: 'estimate-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mealLogCreate).not.toHaveBeenCalled();
  });
});
