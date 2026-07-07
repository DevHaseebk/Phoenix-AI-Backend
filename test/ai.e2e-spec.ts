import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AiMealEstimateStatus,
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AI_PROVIDER } from './../src/ai/ai-provider.interface';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AI (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const conversationCreate = jest.fn();
  const conversationFindFirst = jest.fn();
  const conversationUpdate = jest.fn();
  const conversationFindMany = jest.fn();
  const messageCreate = jest.fn();
  const estimateCreate = jest.fn();
  const estimateFindFirst = jest.fn();
  const estimateUpdate = jest.fn();
  const mealLogCreate = jest.fn();
  const transaction = jest.fn();
  const generateCoachReply = jest.fn();
  const generateMealEstimate = jest.fn();
  const prisma = {
    $transaction: transaction,
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: { findUnique: userFindUnique },
    aiConversation: {
      create: conversationCreate,
      findFirst: conversationFindFirst,
      update: conversationUpdate,
      findMany: conversationFindMany,
    },
    aiMessage: { create: messageCreate },
    aiMealEstimate: {
      create: estimateCreate,
      findFirst: estimateFindFirst,
      update: estimateUpdate,
    },
    mealLog: { create: mealLogCreate },
  };
  const estimateId = '11111111-1111-4111-8111-111111111111';
  const provider = {
    generateCoachReply,
    generateMealEstimate,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockActiveUser();
    conversationCreate.mockResolvedValue({
      id: 'conversation-id',
      type: 'COACHING',
      status: 'ACTIVE',
    });
    conversationUpdate.mockResolvedValue({ id: 'conversation-id' });
    conversationFindMany.mockResolvedValue([]);
    messageCreate.mockImplementation(({ data }: { data: { role: string } }) =>
      Promise.resolve({
        id: data.role === 'USER' ? 'user-message-id' : 'assistant-message-id',
        role: data.role,
        content: data.role === 'USER' ? 'User message' : 'Assistant reply',
        createdAt: new Date('2026-07-07T10:00:00.000Z'),
      }),
    );
    generateCoachReply.mockResolvedValue({
      content: 'Add protein to your next meal and keep it simple.',
      model: 'gemini-2.5-flash',
      latencyMs: 25,
    });
    generateMealEstimate.mockResolvedValue({
      content: '{}',
      structured: {
        intent: 'MEAL_ESTIMATE',
        summary: 'Chicken biryani estimate',
        confidenceLevel: ConfidenceLevel.HIGH,
        confidenceScore: 0.8,
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
      latencyMs: 30,
    });
    estimateCreate.mockResolvedValue({
      id: estimateId,
      status: AiMealEstimateStatus.DRAFT,
    });
    const transactionClient = {
      aiMealEstimate: {
        findFirst: estimateFindFirst,
        update: estimateUpdate,
      },
      mealLog: { create: mealLogCreate },
    };
    transaction.mockImplementation(
      (
        callback: (
          transactionClientArg: typeof transactionClient,
        ) => Promise<unknown>,
      ) => callback(transactionClient),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AI_PROVIDER)
      .useValue(provider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();

    jwtService = app.get(JwtService);
    config = app.get(ConfigService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires auth for AI routes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/chat')
      .send({ message: 'hello' })
      .expect(401);
  });

  it('creates an authenticated AI chat conversation and message', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/chat')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({ message: 'What should I eat tonight?' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          message: 'AI response generated successfully',
          data: expect.objectContaining({
            conversationId: 'conversation-id',
            userMessageId: 'user-message-id',
            message: expect.objectContaining({
              id: 'assistant-message-id',
              role: 'ASSISTANT',
            }) as object,
          }) as object,
          meta: {},
        });
      });

    expect(generateCoachReply).toHaveBeenCalled();
  });

  it('creates an AI meal estimate without creating a MealLog', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/meal-estimate')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        message: 'One medium plate chicken biryani',
        mealType: MealType.LUNCH,
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as { data: unknown };

        expect(body.data).toEqual(
          expect.objectContaining({
            conversationId: 'conversation-id',
            estimateId,
            status: AiMealEstimateStatus.DRAFT,
            estimate: expect.objectContaining({
              calories: 750,
              proteinGrams: 35,
              items: expect.arrayContaining([
                expect.objectContaining({ name: 'Chicken Biryani' }) as object,
              ]) as object[],
            }) as object,
          }),
        );
      });

    expect(estimateCreate).toHaveBeenCalled();
    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  it('confirms an owned AI meal estimate into a MealLog', async () => {
    const loggedAt = new Date('2026-07-07T12:30:00.000Z');
    const createdAt = new Date('2026-07-07T12:31:00.000Z');

    estimateFindFirst.mockResolvedValue({
      id: estimateId,
      userId: 'user-id',
      originalText: 'One medium plate chicken biryani',
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
      description: 'One medium plate chicken biryani',
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
      updatedAt: createdAt,
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
          updatedAt: createdAt,
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/api/v1/ai/meal-confirm')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({ estimateId })
      .expect(201)
      .expect((response) => {
        const body = response.body as { data: unknown };

        expect(body.data).toEqual(
          expect.objectContaining({
            id: 'meal-log-id',
            source: MealLogSource.AI_CHAT,
            status: MealLogStatus.ESTIMATED,
            totalCalories: 750,
            items: [
              expect.objectContaining({
                foodName: 'Chicken Biryani',
                calories: 750,
              }) as object,
            ],
          }),
        );
      });

    expect(estimateUpdate).toHaveBeenCalledWith({
      where: { id: estimateId },
      data: {
        status: AiMealEstimateStatus.CONFIRMED,
        confirmedAt: expect.any(Date) as Date,
        mealLogId: 'meal-log-id',
      },
      select: { id: true },
    });
  });

  function createAccessToken(): string {
    return jwtService.sign(
      {
        sub: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
      },
      {
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  function mockActiveUser(): void {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb Khan',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      profile: null,
      onboarding: null,
      weightLogs: [],
      mealLogs: [],
    });
  }
});
