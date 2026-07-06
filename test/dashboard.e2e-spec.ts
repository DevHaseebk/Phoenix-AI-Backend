import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MealLogStatus,
  MealLogSource,
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

interface DashboardTodayResponseBody {
  success: boolean;
  message: string;
  data: {
    date: string;
    timezone: string;
    profileRequired: boolean;
    onboardingRequired: boolean;
    hero: {
      greeting: string;
      currentWeightKg: number | null;
      startingWeightKg: number | null;
      targetWeightKg: number | null;
      weightLostKg: number | null;
      remainingKg: number | null;
      progressPercentage: number;
    };
    todayProgress: {
      calories: {
        consumed: number;
        target: number | null;
        remaining: number | null;
      };
      protein: {
        consumedGrams: number;
        targetGrams: number | null;
        remainingGrams: number | null;
      };
      water: {
        consumedMl: number;
        targetMl: number;
        remainingMl: number;
      };
      steps: {
        count: number;
        target: number;
        remaining: number;
      };
      exercise: {
        durationMinutes: number;
        estimatedCaloriesBurned: number;
      };
    };
    timeline: Array<{
      id: string;
      type: string;
      mealType: string;
      description: string | null;
      loggedAt: string;
      totalCalories: number;
      totalProteinGrams: number;
      items: Array<{
        foodName: string;
        portionLabel: string | null;
      }>;
    }>;
    quickActions: string[];
    aiFocus: {
      title: string;
      message: string;
      actions: Array<{ type: string; label: string }>;
    };
    weeklyReview: { available: false; status: string };
    rewardsPreview: { available: false; status: string };
    consistency: { last30DaysPercentage: number; label: string };
  };
  meta: Record<string, never>;
}

interface DashboardSummaryResponseBody {
  success: boolean;
  message: string;
  data: {
    range: '7d' | '30d' | '90d';
    startDate: string;
    endDate: string;
    averageCalories: number;
    averageProteinGrams: number;
    averageWaterMl: number;
    averageSteps: number;
    exerciseSessions: number;
    totalExerciseMinutes: number;
    weightChangeKg: number | null;
    mealLoggingDays: number;
    waterLoggingDays: number;
    exerciseLoggingDays: number;
    weightLoggingDays: number;
    consistencyPercentage: number;
  };
  meta: Record<string, never>;
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const weightLogFindFirst = jest.fn();
  const weightLogFindMany = jest.fn();
  const waterLogFindMany = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const mealLogFindMany = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: { findUnique: userFindUnique },
    weightLog: { findFirst: weightLogFindFirst, findMany: weightLogFindMany },
    waterLog: { findMany: waterLogFindMany },
    exerciseLog: { findMany: exerciseLogFindMany },
    mealLog: { findMany: mealLogFindMany },
  };

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date('2026-07-06T12:00:00.000Z') });
    jest.clearAllMocks();
    mockActiveUser();
    weightLogFindFirst
      .mockResolvedValueOnce({ weightKg: new Prisma.Decimal('150') })
      .mockResolvedValueOnce({ weightKg: new Prisma.Decimal('168') });
    weightLogFindMany.mockResolvedValue(createSummaryWeightLogs());
    waterLogFindMany.mockResolvedValue([{ amountMl: 500 }, { amountMl: 750 }]);
    exerciseLogFindMany.mockResolvedValue([
      { durationMinutes: 30, steps: 4000, estimatedCaloriesBurned: 220 },
      { durationMinutes: 15, steps: null, estimatedCaloriesBurned: null },
    ]);
    mealLogFindMany.mockResolvedValue([
      createMealLog({
        id: 'meal-log-id',
        totalCalories: '850',
        totalProteinGrams: '45',
      }),
    ]);

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
    jest.useRealTimers();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/today')
      .expect(401);
  });

  it('returns aggregated dashboard today data for the current user only', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/today')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as DashboardTodayResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data.profileRequired).toBe(false);
        expect(body.data.onboardingRequired).toBe(false);
        expect(body.data.hero).toEqual({
          greeting: expect.stringContaining('Haseeb') as string,
          currentWeightKg: 150,
          startingWeightKg: 168,
          targetWeightKg: 100,
          weightLostKg: 18,
          remainingKg: 50,
          progressPercentage: 26,
        });
        expect(body.data.todayProgress.calories).toEqual({
          consumed: 850,
          target: 2200,
          remaining: 1350,
        });
        expect(typeof body.data.todayProgress.calories.consumed).toBe('number');
        expect(typeof body.data.todayProgress.calories.target).toBe('number');
        expect(typeof body.data.todayProgress.calories.remaining).toBe(
          'number',
        );
        expect(body.data.todayProgress.protein).toEqual({
          consumedGrams: 45,
          targetGrams: 160,
          remainingGrams: 115,
        });
        expect(typeof body.data.todayProgress.protein.consumedGrams).toBe(
          'number',
        );
        expect(typeof body.data.todayProgress.protein.targetGrams).toBe(
          'number',
        );
        expect(typeof body.data.todayProgress.protein.remainingGrams).toBe(
          'number',
        );
        expect(body.data.todayProgress.water).toEqual({
          consumedMl: 1250,
          targetMl: 3000,
          remainingMl: 1750,
        });
        expect(body.data.todayProgress.steps).toEqual({
          count: 4000,
          target: 8000,
          remaining: 4000,
        });
        expect(body.data.todayProgress.exercise).toEqual({
          durationMinutes: 45,
          estimatedCaloriesBurned: 220,
        });
        expect(body.data.timeline).toHaveLength(1);
        expect(body.data.timeline[0]).toEqual({
          id: 'meal-log-id',
          type: 'MEAL',
          mealType: MealType.LUNCH,
          description: 'Chicken biryani',
          loggedAt: '2026-07-06T12:30:00.000Z',
          totalCalories: 850,
          totalProteinGrams: 45,
          items: [
            { foodName: 'Chicken Biryani', portionLabel: 'medium plate' },
          ],
        });
        expect(typeof body.data.timeline[0].totalCalories).toBe('number');
        expect(typeof body.data.timeline[0].totalProteinGrams).toBe('number');
        expect(body.data.aiFocus).toEqual({
          title: 'Protein is your main gap today',
          message: 'Try to add protein in your next meal.',
          actions: [{ type: 'ASK_DINNER_IDEA', label: 'Suggest Dinner' }],
        });
        expect(body.data.quickActions).toEqual([
          'LOG_MEAL',
          'UPDATE_WEIGHT',
          'LOG_WATER',
          'LOG_EXERCISE',
          'ASK_AI',
        ]);
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('refreshTokens');
      });

    expect(mealLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-id',
          loggedAt: {
            gte: expect.any(Date) as Date,
            lte: expect.any(Date) as Date,
          },
        }) as object,
      }),
    );
  });

  it('returns empty profile state when no profile or logs exist', async () => {
    userFindUnique.mockResolvedValue(
      createUser({ profile: null, onboarding: null }),
    );
    weightLogFindFirst.mockReset().mockResolvedValue(null);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    mealLogFindMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/today')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as DashboardTodayResponseBody;

        expect(body.data.profileRequired).toBe(true);
        expect(body.data.onboardingRequired).toBe(true);
        expect(body.data.hero).toEqual({
          greeting: expect.stringContaining('Haseeb') as string,
          currentWeightKg: null,
          startingWeightKg: null,
          targetWeightKg: null,
          weightLostKg: null,
          remainingKg: null,
          progressPercentage: 0,
        });
        expect(body.data.todayProgress.calories).toEqual({
          consumed: 0,
          target: null,
          remaining: null,
        });
        expect(body.data.todayProgress.protein).toEqual({
          consumedGrams: 0,
          targetGrams: null,
          remainingGrams: null,
        });
        expect(body.data.todayProgress.water).toEqual({
          consumedMl: 0,
          targetMl: 3000,
          remainingMl: 3000,
        });
        expect(body.data.todayProgress.steps).toEqual({
          count: 0,
          target: 8000,
          remaining: 8000,
        });
        expect(body.data.todayProgress.exercise).toEqual({
          durationMinutes: 0,
          estimatedCaloriesBurned: 0,
        });
        expect(body.data.timeline).toEqual([]);
        expect(body.data.aiFocus).toEqual({
          title: 'Start with one small win',
          message:
            'Log your first meal, water, or weight update to begin today.',
          actions: [{ type: 'LOG_MEAL', label: 'Log Meal' }],
        });
      });
  });

  it('uses timezone boundaries for today queries', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/today')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200);

    expect(waterLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        loggedAt: {
          gte: expect.any(Date) as Date,
          lte: expect.any(Date) as Date,
        },
      },
      select: { amountMl: true },
    });
    expect(mealLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-id',
          loggedAt: {
            gte: expect.any(Date) as Date,
            lte: expect.any(Date) as Date,
          },
        }) as object,
      }),
    );
  });

  it('requires auth for summary', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .expect(401);
  });

  it('returns default 7d dashboard summary for the current user only', async () => {
    mockSummaryLogs();

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as DashboardSummaryResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toEqual({
          range: '7d',
          startDate: '2026-06-30',
          endDate: '2026-07-06',
          averageCalories: 500,
          averageProteinGrams: 59,
          averageWaterMl: 429,
          averageSteps: 571,
          exerciseSessions: 2,
          totalExerciseMinutes: 75,
          weightChangeKg: -1,
          mealLoggingDays: 2,
          waterLoggingDays: 2,
          exerciseLoggingDays: 2,
          weightLoggingDays: 2,
          consistencyPercentage: 26,
        });
        expect(typeof body.data.averageCalories).toBe('number');
        expect(typeof body.data.averageProteinGrams).toBe('number');
        expect(typeof body.data.weightChangeKg).toBe('number');
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('profile');
        expect(body.data).not.toHaveProperty('refreshTokens');
      });

    expect(weightLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        loggedAt: {
          gte: new Date('2026-06-29T19:00:00.000Z'),
          lte: new Date('2026-07-06T18:59:59.999Z'),
        },
      },
      orderBy: { loggedAt: 'asc' },
      select: { weightKg: true, loggedAt: true },
    });
    expect(mealLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-id',
          loggedAt: {
            gte: new Date('2026-06-29T19:00:00.000Z'),
            lte: new Date('2026-07-06T18:59:59.999Z'),
          },
        }) as object,
      }),
    );
  });

  it.each([
    ['7d', '2026-06-30'],
    ['30d', '2026-06-07'],
    ['90d', '2026-04-08'],
  ])('supports %s summary range', async (range, startDate) => {
    mockSummaryLogs();

    await request(app.getHttpServer())
      .get(`/api/v1/dashboard/summary?range=${range}`)
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as DashboardSummaryResponseBody;

        expect(body.data.range).toBe(range);
        expect(body.data.startDate).toBe(startDate);
        expect(body.data.endDate).toBe('2026-07-06');
      });
  });

  it('rejects invalid summary range', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary?range=14d')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(400);
  });

  it('returns safe zero summary when no profile or logs exist', async () => {
    userFindUnique.mockResolvedValue(
      createUser({ profile: null, onboarding: null }),
    );
    weightLogFindMany.mockResolvedValue([]);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    mealLogFindMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as DashboardSummaryResponseBody;

        expect(body.data).toEqual({
          range: '7d',
          startDate: '2026-06-30',
          endDate: '2026-07-06',
          averageCalories: 0,
          averageProteinGrams: 0,
          averageWaterMl: 0,
          averageSteps: 0,
          exerciseSessions: 0,
          totalExerciseMinutes: 0,
          weightChangeKg: null,
          mealLoggingDays: 0,
          waterLoggingDays: 0,
          exerciseLoggingDays: 0,
          weightLoggingDays: 0,
          consistencyPercentage: 0,
        });
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
    userFindUnique.mockResolvedValue(createUser());
  }

  function createUser(input?: {
    profile?: ReturnType<typeof createProfile> | null;
    onboarding?: { status: string } | null;
  }) {
    return {
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb Khan',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      profile: input?.profile === undefined ? createProfile() : input.profile,
      onboarding:
        input?.onboarding === undefined
          ? { status: 'COMPLETED' }
          : input.onboarding,
    };
  }

  function createProfile() {
    return {
      timezone: 'Asia/Karachi',
      calorieTarget: new Prisma.Decimal('2200'),
      proteinTargetGrams: new Prisma.Decimal('160'),
      currentWeightKg: new Prisma.Decimal('150'),
      targetWeightKg: new Prisma.Decimal('100'),
    };
  }

  function mockSummaryLogs(): void {
    weightLogFindMany.mockResolvedValue(createSummaryWeightLogs());
    waterLogFindMany.mockResolvedValue([
      { amountMl: 1000, loggedAt: new Date('2026-07-01T10:00:00.000Z') },
      { amountMl: 2000, loggedAt: new Date('2026-07-02T10:00:00.000Z') },
    ]);
    exerciseLogFindMany.mockResolvedValue([
      {
        durationMinutes: 30,
        steps: 4000,
        loggedAt: new Date('2026-07-02T10:00:00.000Z'),
      },
      {
        durationMinutes: 45,
        steps: null,
        loggedAt: new Date('2026-07-03T10:00:00.000Z'),
      },
    ]);
    mealLogFindMany.mockResolvedValue([
      {
        totalCalories: new Prisma.Decimal('700'),
        totalProteinGrams: new Prisma.Decimal('80'),
        loggedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
      {
        totalCalories: new Prisma.Decimal('1400'),
        totalProteinGrams: new Prisma.Decimal('170'),
        loggedAt: new Date('2026-07-02T10:00:00.000Z'),
      },
      {
        totalCalories: new Prisma.Decimal('1400'),
        totalProteinGrams: new Prisma.Decimal('160'),
        loggedAt: new Date('2026-07-02T14:00:00.000Z'),
      },
    ]);
  }

  function createSummaryWeightLogs() {
    return [
      {
        weightKg: new Prisma.Decimal('151'),
        loggedAt: new Date('2026-06-30T10:00:00.000Z'),
      },
      {
        weightKg: new Prisma.Decimal('150'),
        loggedAt: new Date('2026-07-06T10:00:00.000Z'),
      },
    ];
  }

  function createMealLog(input: {
    id: string;
    totalCalories: string;
    totalProteinGrams: string;
  }) {
    return {
      id: input.id,
      mealType: MealType.LUNCH,
      description: 'Chicken biryani',
      loggedAt: new Date('2026-07-06T12:30:00.000Z'),
      totalCalories: new Prisma.Decimal(input.totalCalories),
      totalProteinGrams: new Prisma.Decimal(input.totalProteinGrams),
      status: MealLogStatus.LOGGED,
      source: MealLogSource.MANUAL,
      items: [{ foodName: 'Chicken Biryani', portionLabel: 'medium plate' }],
    };
  }
});
