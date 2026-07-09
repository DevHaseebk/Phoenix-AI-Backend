import { UnauthorizedException } from '@nestjs/common';
import {
  ExerciseLogSource,
  ExerciseType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExerciseLogsService } from './exercise-logs.service';

describe('ExerciseLogsService', () => {
  const userFindUnique = jest.fn();
  const exerciseLogCreate = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const weightLogFindFirst = jest.fn();
  const userProfileFindUnique = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    exerciseLog: {
      create: exerciseLogCreate,
      findMany: exerciseLogFindMany,
    },
    weightLog: {
      findFirst: weightLogFindFirst,
    },
    userProfile: {
      findUnique: userProfileFindUnique,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    weightLogFindFirst.mockResolvedValue(null);
    userProfileFindUnique.mockResolvedValue(null);
  });

  it('creates a manual exercise log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: new Prisma.Decimal('3.2'),
      estimatedCaloriesBurned: 220,
      loggedAt,
      source: ExerciseLogSource.MANUAL,
      note: 'Morning walk',
      createdAt,
      updatedAt,
    });

    const service = new ExerciseLogsService(prisma);
    const response = await service.create('user-id', {
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: 3.2,
      estimatedCaloriesBurned: 220,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning walk',
    });

    expect(exerciseLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: 3.2,
        estimatedCaloriesBurned: 220,
        loggedAt,
        source: ExerciseLogSource.MANUAL,
        note: 'Morning walk',
      },
      select: expect.objectContaining({
        id: true,
        distanceKm: true,
      }) as Record<string, boolean>,
    });
    expect(response).toEqual({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: 3.2,
      estimatedCaloriesBurned: 220,
      loggedAt,
      source: ExerciseLogSource.MANUAL,
      note: 'Morning walk',
      createdAt,
      updatedAt,
    });
  });

  it('auto-calculates calories burned from the latest weight log when not provided', async () => {
    weightLogFindFirst.mockResolvedValue({
      weightKg: new Prisma.Decimal('80'),
    });
    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: null,
      distanceKm: null,
      estimatedCaloriesBurned: 140,
      loggedAt: new Date('2026-07-06T08:00:00.000Z'),
      source: ExerciseLogSource.MANUAL,
      note: null,
      createdAt: new Date('2026-07-06T08:01:00.000Z'),
      updatedAt: new Date('2026-07-06T08:01:00.000Z'),
    });

    const service = new ExerciseLogsService(prisma);
    await service.create('user-id', {
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
    });

    expect(weightLogFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-id' } }),
    );
    // 3.5 MET * 80kg * 0.5h = 140
    expect(exerciseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimatedCaloriesBurned: 140,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('falls back to the onboarding profile weight when no weight log exists', async () => {
    weightLogFindFirst.mockResolvedValue(null);
    userProfileFindUnique.mockResolvedValue({
      currentWeightKg: new Prisma.Decimal('70'),
    });
    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.CYCLING,
      durationMinutes: 60,
      steps: null,
      distanceKm: null,
      estimatedCaloriesBurned: 525,
      loggedAt: new Date('2026-07-06T08:00:00.000Z'),
      source: ExerciseLogSource.MANUAL,
      note: null,
      createdAt: new Date('2026-07-06T08:01:00.000Z'),
      updatedAt: new Date('2026-07-06T08:01:00.000Z'),
    });

    const service = new ExerciseLogsService(prisma);
    await service.create('user-id', {
      exerciseType: ExerciseType.CYCLING,
      durationMinutes: 60,
    });

    // 7.5 MET * 70kg * 1h = 525
    expect(exerciseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimatedCaloriesBurned: 525,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('leaves calories burned unset when no weight is known at all', async () => {
    weightLogFindFirst.mockResolvedValue(null);
    userProfileFindUnique.mockResolvedValue(null);
    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: null,
      distanceKm: null,
      estimatedCaloriesBurned: null,
      loggedAt: new Date('2026-07-06T08:00:00.000Z'),
      source: ExerciseLogSource.MANUAL,
      note: null,
      createdAt: new Date('2026-07-06T08:01:00.000Z'),
      updatedAt: new Date('2026-07-06T08:01:00.000Z'),
    });

    const service = new ExerciseLogsService(prisma);
    await service.create('user-id', {
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
    });

    expect(exerciseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimatedCaloriesBurned: undefined,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('lists current user exercise logs with filters and default descending order', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    exerciseLogFindMany.mockResolvedValue([
      {
        id: 'exercise-log-id',
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: new Prisma.Decimal('3.2'),
        estimatedCaloriesBurned: 220,
        loggedAt,
        source: ExerciseLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    const service = new ExerciseLogsService(prisma);
    const response = await service.findMany('user-id', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-06T23:59:59.999Z',
      limit: 10,
      exerciseType: ExerciseType.WALKING,
    });

    expect(exerciseLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        exerciseType: ExerciseType.WALKING,
        loggedAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-06T23:59:59.999Z'),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: 10,
      select: expect.any(Object) as Record<string, boolean>,
    });
    expect(response).toEqual([
      {
        id: 'exercise-log-id',
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: 3.2,
        estimatedCaloriesBurned: 220,
        loggedAt,
        source: ExerciseLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it('uses default list limit of 30', async () => {
    exerciseLogFindMany.mockResolvedValue([]);

    const service = new ExerciseLogsService(prisma);
    await service.findMany('user-id', {});

    expect(exerciseLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
  });

  it('rejects inactive or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new ExerciseLogsService(prisma);

    await expect(
      service.create('user-id', {
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(exerciseLogCreate).not.toHaveBeenCalled();
  });
});
