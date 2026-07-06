import { WeightLogSource } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { WeightLogsController } from './weight-logs.controller';
import { WeightLogsService } from './weight-logs.service';

describe('WeightLogsController', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const weightLogsService = {
    create,
    findMany,
  } as unknown as WeightLogsService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard create weight log response', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    create.mockResolvedValue({
      id: 'weight-log-id',
      weightKg: 149.8,
      loggedAt,
      source: WeightLogSource.MANUAL,
      note: 'Morning weight',
      createdAt,
      updatedAt,
    });

    const controller = new WeightLogsController(weightLogsService);
    const response = await controller.create(currentUser, {
      weightKg: 149.8,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning weight',
    });

    expect(create).toHaveBeenCalledWith('user-id', {
      weightKg: 149.8,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning weight',
    });
    expect(response).toEqual({
      success: true,
      message: 'Weight logged successfully',
      data: {
        id: 'weight-log-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: 'Morning weight',
        createdAt,
        updatedAt,
      },
      meta: {},
    });
  });

  it('returns standard list weight logs response', async () => {
    findMany.mockResolvedValue([]);

    const controller = new WeightLogsController(weightLogsService);
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
