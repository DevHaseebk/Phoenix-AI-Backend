import { UnauthorizedException } from '@nestjs/common';
import { UserStatus, WeightLogSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WeightLogsService } from './weight-logs.service';

describe('WeightLogsService', () => {
  const userFindUnique = jest.fn();
  const weightLogCreate = jest.fn();
  const weightLogFindMany = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    weightLog: {
      create: weightLogCreate,
      findMany: weightLogFindMany,
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

  it('creates a manual weight log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    weightLogCreate.mockResolvedValue({
      id: 'weight-log-id',
      weightKg: 149.8,
      loggedAt,
      source: WeightLogSource.MANUAL,
      note: 'Morning weight',
      createdAt,
      updatedAt,
    });

    const service = new WeightLogsService(prisma);
    const response = await service.create('user-id', {
      weightKg: 149.8,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning weight',
    });

    expect(weightLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: 'Morning weight',
      },
      select: expect.objectContaining({
        id: true,
        weightKg: true,
      }) as Record<string, boolean>,
    });
    expect(response).toEqual({
      id: 'weight-log-id',
      weightKg: 149.8,
      loggedAt,
      source: WeightLogSource.MANUAL,
      note: 'Morning weight',
      createdAt,
      updatedAt,
    });
  });

  it('lists current user weight logs with filters and default descending order', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    weightLogFindMany.mockResolvedValue([
      {
        id: 'weight-log-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    const service = new WeightLogsService(prisma);
    const response = await service.findMany('user-id', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-06T23:59:59.999Z',
      limit: 10,
    });

    expect(weightLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
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
        id: 'weight-log-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it('uses default list limit of 30', async () => {
    weightLogFindMany.mockResolvedValue([]);

    const service = new WeightLogsService(prisma);
    await service.findMany('user-id', {});

    expect(weightLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
  });

  it('rejects inactive or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new WeightLogsService(prisma);

    await expect(
      service.create('user-id', { weightKg: 150 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(weightLogCreate).not.toHaveBeenCalled();
  });
});
