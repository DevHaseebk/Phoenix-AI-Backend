import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

interface ErrorResponseBody {
  success: false;
  message: string;
  error: {
    code: string;
    details: unknown[];
  };
}

interface MealLogItemResponseData {
  id: string;
  foodName: string;
  portionLabel: string | null;
  quantity: number | null;
  calories: number;
  proteinGrams: number;
  carbsGrams: number | null;
  fatGrams: number | null;
  confidenceLevel: string;
  createdAt: string;
  updatedAt: string;
}

interface MealLogResponseData {
  id: string;
  mealType: string;
  description: string | null;
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number | null;
  totalFatGrams: number | null;
  status: string;
  confidenceLevel: string;
  source: string;
  loggedAt: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: MealLogItemResponseData[];
}

interface MealLogResponseBody {
  success: boolean;
  message: string;
  data: MealLogResponseData;
  meta: Record<string, never>;
}

interface MealLogListResponseBody {
  success: boolean;
  message: string;
  data: MealLogResponseData[];
  meta: Record<string, never>;
}

describe('Meal Logs (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const mealLogCreate = jest.fn();
  const mealLogFindMany = jest.fn();
  const mealLogFindFirst = jest.fn();
  const mealLogUpdate = jest.fn();
  const mealLogDelete = jest.fn();
  const mealLogItemDeleteMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    $transaction: transaction,
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique: userFindUnique,
    },
    weightLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    waterLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    exerciseLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    mealLog: {
      create: mealLogCreate,
      findMany: mealLogFindMany,
      findFirst: mealLogFindFirst,
      update: mealLogUpdate,
      delete: mealLogDelete,
    },
    mealLogItem: {
      deleteMany: mealLogItemDeleteMany,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockActiveUser();
    mealLogFindFirst.mockResolvedValue({ id: 'meal-log-id' });
    const transactionClient = {
      mealLog: {
        findFirst: mealLogFindFirst,
        update: mealLogUpdate,
      },
      mealLogItem: {
        deleteMany: mealLogItemDeleteMany,
      },
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

  it('requires auth for meal log routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/logs/meals').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/logs/meals/meal-log-id')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/logs/meals')
      .send({
        mealType: MealType.LUNCH,
        items: [
          { foodName: 'Chicken Biryani', calories: 750, proteinGrams: 35 },
        ],
      })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/logs/meals/meal-log-id')
      .send({ mealType: MealType.DINNER })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/logs/meals/meal-log-id')
      .expect(401);
  });

  it('creates a meal log for the current user and calculates totals from items', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');
    const expectedCreatedItems = [
      {
        foodName: 'Chicken Biryani',
        portionLabel: 'medium plate',
        quantity: 1,
        calories: 750,
        proteinGrams: 35,
        carbsGrams: 85,
        fatGrams: 28,
        confidenceLevel: ConfidenceLevel.VERIFIED,
      },
      {
        foodName: 'Raita',
        portionLabel: 'small bowl',
        quantity: 1,
        calories: 100,
        proteinGrams: 10,
        carbsGrams: 10,
        fatGrams: 5,
        confidenceLevel: ConfidenceLevel.VERIFIED,
      },
    ] satisfies Prisma.MealLogItemCreateWithoutMealLogInput[];

    mealLogCreate.mockResolvedValue(
      createPrismaMealLog({
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '850',
        totalProteinGrams: '45',
        totalCarbsGrams: '95',
        totalFatGrams: '33',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id-1',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
          createPrismaMealItem({
            id: 'meal-item-id-2',
            foodName: 'Raita',
            portionLabel: 'small bowl',
            quantity: '1',
            calories: '100',
            proteinGrams: '10',
            carbsGrams: '10',
            fatGrams: '5',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/logs/meals')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        mealType: MealType.LUNCH,
        loggedAt: loggedAt.toISOString(),
        description: 'Chicken biryani',
        note: 'Home cooked',
        items: [
          {
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: 1,
            calories: 750,
            proteinGrams: 35,
            carbsGrams: 85,
            fatGrams: 28,
          },
          {
            foodName: 'Raita',
            portionLabel: 'small bowl',
            quantity: 1,
            calories: 100,
            proteinGrams: 10,
            carbsGrams: 10,
            fatGrams: 5,
          },
        ],
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as MealLogResponseBody;

        expect(body).toEqual({
          success: true,
          message: 'Meal logged successfully',
          data: {
            id: 'meal-log-id',
            mealType: MealType.LUNCH,
            description: 'Chicken biryani',
            totalCalories: 850,
            totalProteinGrams: 45,
            totalCarbsGrams: 95,
            totalFatGrams: 33,
            status: MealLogStatus.LOGGED,
            confidenceLevel: ConfidenceLevel.VERIFIED,
            source: MealLogSource.MANUAL,
            loggedAt: loggedAt.toISOString(),
            note: 'Home cooked',
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
            items: [
              {
                id: 'meal-item-id-1',
                foodName: 'Chicken Biryani',
                portionLabel: 'medium plate',
                quantity: 1,
                calories: 750,
                proteinGrams: 35,
                carbsGrams: 85,
                fatGrams: 28,
                confidenceLevel: ConfidenceLevel.VERIFIED,
                createdAt: createdAt.toISOString(),
                updatedAt: updatedAt.toISOString(),
              },
              {
                id: 'meal-item-id-2',
                foodName: 'Raita',
                portionLabel: 'small bowl',
                quantity: 1,
                calories: 100,
                proteinGrams: 10,
                carbsGrams: 10,
                fatGrams: 5,
                confidenceLevel: ConfidenceLevel.VERIFIED,
                createdAt: createdAt.toISOString(),
                updatedAt: updatedAt.toISOString(),
              },
            ],
          },
          meta: {},
        });
        expect(typeof body.data.totalCalories).toBe('number');
        expect(typeof body.data.totalProteinGrams).toBe('number');
        expect(typeof body.data.totalCarbsGrams).toBe('number');
        expect(typeof body.data.totalFatGrams).toBe('number');
        expect(typeof body.data.items[0].quantity).toBe('number');
        expect(typeof body.data.items[0].calories).toBe('number');
        expect(typeof body.data.items[0].proteinGrams).toBe('number');
        expect(typeof body.data.items[0].carbsGrams).toBe('number');
        expect(typeof body.data.items[0].fatGrams).toBe('number');
        expect(body.data).not.toHaveProperty('userId');
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('profile');
        expect(body.data).not.toHaveProperty('refreshTokens');
      });

    expect(mealLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        mealType: MealType.LUNCH,
        loggedAt,
        source: MealLogSource.MANUAL,
        status: MealLogStatus.LOGGED,
        confidenceLevel: ConfidenceLevel.VERIFIED,
        description: 'Chicken biryani',
        note: 'Home cooked',
        totalCalories: 850,
        totalProteinGrams: 45,
        totalCarbsGrams: 95,
        totalFatGrams: 33,
        items: {
          create: expectedCreatedItems,
        },
      },
      select: expect.any(Object) as object,
    });
  });

  it('rejects invalid mealType', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/meals')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        mealType: 'INVALID',
        items: [
          { foodName: 'Chicken Biryani', calories: 750, proteinGrams: 35 },
        ],
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  it('rejects empty items', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/meals')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        mealType: MealType.LUNCH,
        items: [],
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  it('rejects client-controlled unsafe fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/meals')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        userId: 'other-user-id',
        source: MealLogSource.AI_CHAT,
        status: MealLogStatus.ESTIMATED,
        confidenceLevel: ConfidenceLevel.LOW,
        totalCalories: 1,
        totalProteinGrams: 1,
        totalCarbsGrams: 1,
        totalFatGrams: 1,
        mealType: MealType.LUNCH,
        items: [
          { foodName: 'Chicken Biryani', calories: 750, proteinGrams: 35 },
        ],
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  it('lists only current user meal logs and respects filters', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogFindMany.mockResolvedValue([
      createPrismaMealLog({
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '750',
        totalProteinGrams: '35',
        totalCarbsGrams: '85',
        totalFatGrams: '28',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    ]);

    await request(app.getHttpServer())
      .get(
        '/api/v1/logs/meals?limit=1&mealType=LUNCH&from=2026-07-01T00:00:00.000Z&to=2026-07-06T23:59:59.999Z',
      )
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as MealLogListResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toEqual({
          id: 'meal-log-id',
          mealType: MealType.LUNCH,
          description: 'Chicken biryani',
          totalCalories: 750,
          totalProteinGrams: 35,
          totalCarbsGrams: 85,
          totalFatGrams: 28,
          status: MealLogStatus.LOGGED,
          confidenceLevel: ConfidenceLevel.VERIFIED,
          source: MealLogSource.MANUAL,
          loggedAt: loggedAt.toISOString(),
          note: 'Home cooked',
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          items: [
            {
              id: 'meal-item-id',
              foodName: 'Chicken Biryani',
              portionLabel: 'medium plate',
              quantity: 1,
              calories: 750,
              proteinGrams: 35,
              carbsGrams: 85,
              fatGrams: 28,
              confidenceLevel: ConfidenceLevel.VERIFIED,
              createdAt: createdAt.toISOString(),
              updatedAt: updatedAt.toISOString(),
            },
          ],
        });
        expect(body.data[0]).not.toHaveProperty('userId');
        expect(body.data[0]).not.toHaveProperty('passwordHash');
        expect(typeof body.data[0].totalCalories).toBe('number');
        expect(typeof body.data[0].items[0].quantity).toBe('number');
        expect(typeof body.data[0].items[0].calories).toBe('number');
        expect(typeof body.data[0].items[0].proteinGrams).toBe('number');
        expect(typeof body.data[0].items[0].carbsGrams).toBe('number');
        expect(typeof body.data[0].items[0].fatGrams).toBe('number');
      });

    expect(mealLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        mealType: MealType.LUNCH,
        loggedAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-06T23:59:59.999Z'),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: 1,
      select: expect.any(Object) as object,
    });
  });

  it('gets the current user meal with items', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogFindFirst.mockResolvedValue(
      createPrismaMealLog({
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '750',
        totalProteinGrams: '35',
        totalCarbsGrams: '85',
        totalFatGrams: '28',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/logs/meals/meal-log-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as MealLogResponseBody;

        expect(body.message).toBe('Fetched successfully');
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].foodName).toBe('Chicken Biryani');
        expect(typeof body.data.items[0].calories).toBe('number');
        expect(body.data).not.toHaveProperty('userId');
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    expect(mealLogFindFirst).toHaveBeenCalledWith({
      where: { id: 'meal-log-id', userId: 'user-id' },
      select: expect.any(Object) as object,
    });
  });

  it('does not get another user meal', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/v1/logs/meals/other-meal-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(404)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NOT_FOUND');
      });
  });

  it('updates meal fields without replacing items or totals', async () => {
    const loggedAt = new Date('2026-07-06T13:00:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T13:01:00.000Z');

    mealLogUpdate.mockResolvedValue(
      createPrismaMealLog({
        mealType: MealType.DINNER,
        description: 'Updated dinner',
        note: 'Updated note',
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '750',
        totalProteinGrams: '35',
        totalCarbsGrams: '85',
        totalFatGrams: '28',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .patch('/api/v1/logs/meals/meal-log-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        mealType: MealType.DINNER,
        loggedAt: loggedAt.toISOString(),
        description: 'Updated dinner',
        note: 'Updated note',
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as MealLogResponseBody;

        expect(body.message).toBe('Meal updated successfully');
        expect(body.data.mealType).toBe(MealType.DINNER);
        expect(body.data.totalCalories).toBe(750);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].foodName).toBe('Chicken Biryani');
        expect(typeof body.data.items[0].quantity).toBe('number');
        expect(typeof body.data.items[0].calories).toBe('number');
        expect(typeof body.data.items[0].proteinGrams).toBe('number');
        expect(typeof body.data.items[0].carbsGrams).toBe('number');
        expect(typeof body.data.items[0].fatGrams).toBe('number');
      });

    expect(mealLogUpdate).toHaveBeenCalledWith({
      where: { id: 'meal-log-id' },
      data: {
        mealType: MealType.DINNER,
        loggedAt,
        description: 'Updated dinner',
        note: 'Updated note',
      },
      select: expect.any(Object) as object,
    });
  });

  it('replaces meal items and recalculates totals', async () => {
    const loggedAt = new Date('2026-07-06T13:00:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T13:01:00.000Z');

    mealLogUpdate.mockResolvedValue(
      createPrismaMealLog({
        mealType: MealType.DINNER,
        description: 'Updated dinner',
        note: 'Updated note',
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '600',
        totalProteinGrams: '40',
        totalCarbsGrams: '55',
        totalFatGrams: '22',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id-new',
            foodName: 'Grilled Chicken',
            portionLabel: '1 plate',
            quantity: '1',
            calories: '600',
            proteinGrams: '40',
            carbsGrams: '55',
            fatGrams: '22',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    await request(app.getHttpServer())
      .patch('/api/v1/logs/meals/meal-log-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        mealType: MealType.DINNER,
        loggedAt: loggedAt.toISOString(),
        description: 'Updated dinner',
        note: 'Updated note',
        items: [
          {
            foodName: 'Grilled Chicken',
            portionLabel: '1 plate',
            quantity: 1,
            calories: 600,
            proteinGrams: 40,
            carbsGrams: 55,
            fatGrams: 22,
          },
        ],
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as MealLogResponseBody;

        expect(body.data.totalCalories).toBe(600);
        expect(body.data.totalProteinGrams).toBe(40);
        expect(body.data.totalCarbsGrams).toBe(55);
        expect(body.data.totalFatGrams).toBe(22);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].foodName).toBe('Grilled Chicken');
        expect(typeof body.data.items[0].quantity).toBe('number');
        expect(typeof body.data.items[0].calories).toBe('number');
        expect(typeof body.data.items[0].proteinGrams).toBe('number');
        expect(typeof body.data.items[0].carbsGrams).toBe('number');
        expect(typeof body.data.items[0].fatGrams).toBe('number');
      });

    expect(transaction).toHaveBeenCalled();
    expect(mealLogItemDeleteMany).toHaveBeenCalledWith({
      where: { mealLogId: 'meal-log-id' },
    });
  });

  it('rejects unsafe fields on update', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/logs/meals/meal-log-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        userId: 'other-user-id',
        source: MealLogSource.AI_CHAT,
        status: MealLogStatus.ESTIMATED,
        confidenceLevel: ConfidenceLevel.LOW,
        totalCalories: 1,
        totalProteinGrams: 1,
        totalCarbsGrams: 1,
        totalFatGrams: 1,
        mealType: MealType.DINNER,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(mealLogUpdate).not.toHaveBeenCalled();
  });

  it('does not update another user meal', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .patch('/api/v1/logs/meals/other-meal-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({ mealType: MealType.DINNER })
      .expect(404);

    expect(mealLogUpdate).not.toHaveBeenCalled();
  });

  it('hard deletes the current user meal', async () => {
    mealLogDelete.mockResolvedValue({ id: 'meal-log-id' });

    await request(app.getHttpServer())
      .delete('/api/v1/logs/meals/meal-log-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          message: 'Meal deleted successfully',
          data: null,
          meta: {},
        });
      });

    expect(mealLogDelete).toHaveBeenCalledWith({
      where: { id: 'meal-log-id' },
      select: { id: true },
    });
  });

  it('does not delete another user meal', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .delete('/api/v1/logs/meals/other-meal-id')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(404);

    expect(mealLogDelete).not.toHaveBeenCalled();
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
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
  }

  function createPrismaMealLog(input: {
    id?: string;
    mealType?: MealType;
    description?: string | null;
    note?: string | null;
    loggedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    totalCalories: string;
    totalProteinGrams: string;
    totalCarbsGrams: string | null;
    totalFatGrams: string | null;
    items: ReturnType<typeof createPrismaMealItem>[];
  }) {
    return {
      id: input.id ?? 'meal-log-id',
      mealType: input.mealType ?? MealType.LUNCH,
      description: input.description ?? 'Chicken biryani',
      totalCalories: new Prisma.Decimal(input.totalCalories),
      totalProteinGrams: new Prisma.Decimal(input.totalProteinGrams),
      totalCarbsGrams:
        input.totalCarbsGrams === null
          ? null
          : new Prisma.Decimal(input.totalCarbsGrams),
      totalFatGrams:
        input.totalFatGrams === null
          ? null
          : new Prisma.Decimal(input.totalFatGrams),
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt: input.loggedAt,
      note: input.note ?? 'Home cooked',
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      items: input.items,
    };
  }

  function createPrismaMealItem(input: {
    id: string;
    foodName: string;
    portionLabel: string | null;
    quantity: string | null;
    calories: string;
    proteinGrams: string;
    carbsGrams: string | null;
    fatGrams: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: input.id,
      foodName: input.foodName,
      portionLabel: input.portionLabel,
      quantity:
        input.quantity === null ? null : new Prisma.Decimal(input.quantity),
      calories: new Prisma.Decimal(input.calories),
      proteinGrams: new Prisma.Decimal(input.proteinGrams),
      carbsGrams:
        input.carbsGrams === null ? null : new Prisma.Decimal(input.carbsGrams),
      fatGrams:
        input.fatGrams === null ? null : new Prisma.Decimal(input.fatGrams),
      confidenceLevel: ConfidenceLevel.VERIFIED,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }
});
