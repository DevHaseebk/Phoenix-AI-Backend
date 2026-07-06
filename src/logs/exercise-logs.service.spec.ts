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
  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    exerciseLog: {
      create: exerciseLogCreate,
      findMany: exerciseLogFindMany,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
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
