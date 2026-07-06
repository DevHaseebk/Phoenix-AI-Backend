import { UnauthorizedException } from '@nestjs/common';
import { UserStatus, WaterLogSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WaterLogsService } from './water-logs.service';

describe('WaterLogsService', () => {
  const userFindUnique = jest.fn();
  const waterLogCreate = jest.fn();
  const waterLogFindMany = jest.fn();
  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    waterLog: {
      create: waterLogCreate,
      findMany: waterLogFindMany,
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

  it('creates a manual water log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    waterLogCreate.mockResolvedValue({
      id: 'water-log-id',
      amountMl: 500,
      loggedAt,
      source: WaterLogSource.MANUAL,
      note: 'Morning water',
      createdAt,
      updatedAt,
    });

    const service = new WaterLogsService(prisma);
    const response = await service.create('user-id', {
      amountMl: 500,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning water',
    });

    expect(waterLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: 'Morning water',
      },
      select: expect.objectContaining({
        id: true,
        amountMl: true,
      }) as Record<string, boolean>,
    });
    expect(response).toEqual({
      id: 'water-log-id',
      amountMl: 500,
      loggedAt,
      source: WaterLogSource.MANUAL,
      note: 'Morning water',
      createdAt,
      updatedAt,
    });
  });

  it('lists current user water logs with filters and default descending order', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    waterLogFindMany.mockResolvedValue([
      {
        id: 'water-log-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    const service = new WaterLogsService(prisma);
    const response = await service.findMany('user-id', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-06T23:59:59.999Z',
      limit: 10,
    });

    expect(waterLogFindMany).toHaveBeenCalledWith({
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
        id: 'water-log-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it('uses default list limit of 30', async () => {
    waterLogFindMany.mockResolvedValue([]);

    const service = new WaterLogsService(prisma);
    await service.findMany('user-id', {});

    expect(waterLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
  });

  it('rejects inactive or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new WaterLogsService(prisma);

    await expect(
      service.create('user-id', { amountMl: 500 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(waterLogCreate).not.toHaveBeenCalled();
  });
});
