import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  MealLogStatus,
  MealLogSource,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryRange } from './dto/dashboard-summary-query.dto';

describe('DashboardService', () => {
  const userFindUnique = jest.fn();
  const weightLogFindFirst = jest.fn();
  const weightLogFindMany = jest.fn();
  const waterLogFindMany = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const mealLogFindMany = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    weightLog: { findFirst: weightLogFindFirst, findMany: weightLogFindMany },
    waterLog: { findMany: waterLogFindMany },
    exerciseLog: { findMany: exerciseLogFindMany },
    mealLog: { findMany: mealLogFindMany },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue(createUser());
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
        mealType: MealType.LUNCH,
        totalCalories: '850',
        totalProteinGrams: '45',
        description: 'Chicken biryani',
      }),
    ]);
  });

  it('aggregates dashboard today data for an active user', async () => {
    const service = new DashboardService(prisma);
    const response = await service.getToday(
      'user-id',
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
      }),
    );
    expect(waterLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        loggedAt: {
          gte: new Date('2026-07-05T19:00:00.000Z'),
          lte: new Date('2026-07-06T18:59:59.999Z'),
        },
      },
      select: { amountMl: true },
    });
    expect(response.hero).toEqual({
      greeting: 'Good evening, Haseeb',
      currentWeightKg: 150,
      startingWeightKg: 168,
      targetWeightKg: 100,
      weightLostKg: 18,
      remainingKg: 50,
      progressPercentage: 26,
    });
    expect(response.todayProgress.calories).toEqual({
      consumed: 850,
      target: 2200,
      remaining: 1350,
    });
    expect(response.todayProgress.protein).toEqual({
      consumedGrams: 45,
      targetGrams: 160,
      remainingGrams: 115,
    });
    expect(response.todayProgress.water).toEqual({
      consumedMl: 1250,
      targetMl: 3000,
      remainingMl: 1750,
    });
    expect(response.todayProgress.steps).toEqual({
      count: 4000,
      target: 8000,
      remaining: 4000,
    });
    expect(response.todayProgress.exercise).toEqual({
      durationMinutes: 45,
      estimatedCaloriesBurned: 220,
    });
    expect(response.timeline).toEqual([
      {
        id: 'meal-log-id',
        type: 'MEAL',
        mealType: MealType.LUNCH,
        description: 'Chicken biryani',
        loggedAt: new Date('2026-07-06T12:30:00.000Z'),
        totalCalories: 850,
        totalProteinGrams: 45,
        items: [{ foodName: 'Chicken Biryani', portionLabel: 'medium plate' }],
      },
    ]);
  });

  it('returns safe empty state when profile and logs are missing', async () => {
    userFindUnique.mockResolvedValue(
      createUser({ profile: null, onboarding: null }),
    );
    weightLogFindFirst.mockReset().mockResolvedValue(null);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    mealLogFindMany.mockResolvedValue([]);

    const service = new DashboardService(prisma);
    const response = await service.getToday(
      'user-id',
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(response.timezone).toBe('Asia/Karachi');
    expect(response.profileRequired).toBe(true);
    expect(response.onboardingRequired).toBe(true);
    expect(response.hero.currentWeightKg).toBeNull();
    expect(response.hero.progressPercentage).toBe(0);
    expect(response.todayProgress.calories).toEqual({
      consumed: 0,
      target: null,
      remaining: null,
    });
    expect(response.todayProgress.water.consumedMl).toBe(0);
    expect(response.timeline).toEqual([]);
    expect(response.aiFocus.title).toBe('Start with one small win');
  });

  it('falls back to profile weight when no weight logs exist', async () => {
    weightLogFindFirst.mockReset().mockResolvedValue(null);

    const service = new DashboardService(prisma);
    const response = await service.getToday(
      'user-id',
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(response.hero.currentWeightKg).toBe(150);
    expect(response.hero.startingWeightKg).toBe(150);
    expect(response.hero.weightLostKg).toBe(0);
    expect(response.hero.remainingKg).toBe(50);
  });

  it('rejects missing, inactive, or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new DashboardService(prisma);

    await expect(service.getToday('user-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mealLogFindMany).not.toHaveBeenCalled();
  });

  it('aggregates dashboard summary data with the default 7d range', async () => {
    mockSummaryLogs();

    const service = new DashboardService(prisma);
    const response = await service.getSummary(
      'user-id',
      undefined,
      new Date('2026-07-06T12:00:00.000Z'),
    );

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
    expect(response).toEqual({
      range: DashboardSummaryRange.SEVEN_DAYS,
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
  });

  it('supports 30d and 90d summary ranges', async () => {
    mockSummaryLogs();

    const service = new DashboardService(prisma);
    const thirtyDayResponse = await service.getSummary(
      'user-id',
      DashboardSummaryRange.THIRTY_DAYS,
      new Date('2026-07-06T12:00:00.000Z'),
    );
    const ninetyDayResponse = await service.getSummary(
      'user-id',
      DashboardSummaryRange.NINETY_DAYS,
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(thirtyDayResponse.range).toBe(DashboardSummaryRange.THIRTY_DAYS);
    expect(thirtyDayResponse.startDate).toBe('2026-06-07');
    expect(thirtyDayResponse.averageCalories).toBe(117);
    expect(ninetyDayResponse.range).toBe(DashboardSummaryRange.NINETY_DAYS);
    expect(ninetyDayResponse.startDate).toBe('2026-04-08');
    expect(ninetyDayResponse.averageCalories).toBe(39);
  });

  it('rejects invalid summary ranges when called directly', async () => {
    const service = new DashboardService(prisma);

    await expect(
      service.getSummary(
        'user-id',
        '14d' as DashboardSummaryRange,
        new Date('2026-07-06T12:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns zero-safe summary when profile and logs are missing', async () => {
    userFindUnique.mockResolvedValue(
      createUser({ profile: null, onboarding: null }),
    );
    weightLogFindMany.mockResolvedValue([]);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    mealLogFindMany.mockResolvedValue([]);

    const service = new DashboardService(prisma);
    const response = await service.getSummary(
      'user-id',
      DashboardSummaryRange.SEVEN_DAYS,
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(response).toEqual({
      range: DashboardSummaryRange.SEVEN_DAYS,
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

  it('returns null weight change when fewer than two weight logs exist', async () => {
    mockSummaryLogs();
    weightLogFindMany.mockResolvedValue([
      {
        weightKg: new Prisma.Decimal('150'),
        loggedAt: new Date('2026-07-06T10:00:00.000Z'),
      },
    ]);

    const service = new DashboardService(prisma);
    const response = await service.getSummary(
      'user-id',
      DashboardSummaryRange.SEVEN_DAYS,
      new Date('2026-07-06T12:00:00.000Z'),
    );

    expect(response.weightChangeKg).toBeNull();
    expect(response.weightLoggingDays).toBe(1);
  });

  it('rejects inactive users for summary data', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.DELETED,
      deletedAt: null,
    });

    const service = new DashboardService(prisma);

    await expect(service.getSummary('user-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(weightLogFindMany).not.toHaveBeenCalled();
  });

  function createUser(input?: {
    profile?: ReturnType<typeof createProfile> | null;
    onboarding?: { status: string } | null;
  }) {
    return {
      id: 'user-id',
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

  function mockSummaryLogs() {
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
    mealType: MealType;
    description: string;
    totalCalories: string;
    totalProteinGrams: string;
  }) {
    return {
      id: input.id,
      mealType: input.mealType,
      description: input.description,
      loggedAt: new Date('2026-07-06T12:30:00.000Z'),
      totalCalories: new Prisma.Decimal(input.totalCalories),
      totalProteinGrams: new Prisma.Decimal(input.totalProteinGrams),
      status: MealLogStatus.LOGGED,
      source: MealLogSource.MANUAL,
      items: [{ foodName: 'Chicken Biryani', portionLabel: 'medium plate' }],
    };
  }
});
