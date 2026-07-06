import { WaterLogSource } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { WaterLogsController } from './water-logs.controller';
import { WaterLogsService } from './water-logs.service';

describe('WaterLogsController', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const waterLogsService = {
    create,
    findMany,
  } as unknown as WaterLogsService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard create water log response', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    create.mockResolvedValue({
      id: 'water-log-id',
      amountMl: 500,
      loggedAt,
      source: WaterLogSource.MANUAL,
      note: 'Morning water',
      createdAt,
      updatedAt,
    });

    const controller = new WaterLogsController(waterLogsService);
    const response = await controller.create(currentUser, {
      amountMl: 500,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning water',
    });

    expect(create).toHaveBeenCalledWith('user-id', {
      amountMl: 500,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning water',
    });
    expect(response).toEqual({
      success: true,
      message: 'Water logged successfully',
      data: {
        id: 'water-log-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: 'Morning water',
        createdAt,
        updatedAt,
      },
      meta: {},
    });
  });

  it('returns standard list water logs response', async () => {
    findMany.mockResolvedValue([]);

    const controller = new WaterLogsController(waterLogsService);
    const response = await controller.findMany(currentUser, { limit: 10 });

    expect(findMany).toHaveBeenCalledWith('user-id', { limit: 10 });
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: [],
      meta: {},
    });
  });
});
