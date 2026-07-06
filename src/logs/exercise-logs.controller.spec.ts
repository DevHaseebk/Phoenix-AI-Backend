import { ExerciseLogSource, ExerciseType, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ExerciseLogsController } from './exercise-logs.controller';
import { ExerciseLogsService } from './exercise-logs.service';

describe('ExerciseLogsController', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const exerciseLogsService = {
    create,
    findMany,
  } as unknown as ExerciseLogsService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard create exercise log response', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    create.mockResolvedValue({
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

    const controller = new ExerciseLogsController(exerciseLogsService);
    const response = await controller.create(currentUser, {
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: 3.2,
      estimatedCaloriesBurned: 220,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning walk',
    });

    expect(create).toHaveBeenCalledWith('user-id', {
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: 3.2,
      estimatedCaloriesBurned: 220,
      loggedAt: loggedAt.toISOString(),
      note: 'Morning walk',
    });
    expect(response).toEqual({
      success: true,
      message: 'Exercise logged successfully',
      data: {
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
      },
      meta: {},
    });
  });

  it('returns standard list exercise logs response', async () => {
    findMany.mockResolvedValue([]);

    const controller = new ExerciseLogsController(exerciseLogsService);
    const response = await controller.findMany(currentUser, {
      limit: 10,
      exerciseType: ExerciseType.WALKING,
    });

    expect(findMany).toHaveBeenCalledWith('user-id', {
      limit: 10,
      exerciseType: ExerciseType.WALKING,
    });
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: [],
      meta: {},
    });
  });
});
