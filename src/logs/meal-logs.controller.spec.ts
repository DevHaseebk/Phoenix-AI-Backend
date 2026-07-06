import {
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { MealLogsController } from './meal-logs.controller';
import { MealLogsService } from './meal-logs.service';

describe('MealLogsController', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const mealLogsService = {
    create,
    findMany,
    findOne,
    update,
    remove,
  } as unknown as MealLogsService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard create meal log response', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    create.mockResolvedValue({
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
      loggedAt,
      note: 'Home cooked',
      createdAt,
      updatedAt,
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
          createdAt,
          updatedAt,
        },
      ],
    });

    const controller = new MealLogsController(mealLogsService);
    const response = await controller.create(currentUser, {
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
      ],
    });

    expect(create).toHaveBeenCalledWith('user-id', {
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
      ],
    });
    expect(response).toEqual({
      success: true,
      message: 'Meal logged successfully',
      data: {
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
        loggedAt,
        note: 'Home cooked',
        createdAt,
        updatedAt,
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
            createdAt,
            updatedAt,
          },
        ],
      },
      meta: {},
    });
  });

  it('returns standard list meal logs response', async () => {
    findMany.mockResolvedValue([]);

    const controller = new MealLogsController(mealLogsService);
    const response = await controller.findMany(currentUser, {
      limit: 10,
      mealType: MealType.LUNCH,
    });

    expect(findMany).toHaveBeenCalledWith('user-id', {
      limit: 10,
      mealType: MealType.LUNCH,
    });
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: [],
      meta: {},
    });
  });

  it('returns standard get meal log response', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    findOne.mockResolvedValue({
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
      loggedAt,
      note: 'Home cooked',
      createdAt,
      updatedAt,
      items: [],
    });

    const controller = new MealLogsController(mealLogsService);
    const response = await controller.findOne(currentUser, 'meal-log-id');

    expect(findOne).toHaveBeenCalledWith('user-id', 'meal-log-id');
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: {
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
        loggedAt,
        note: 'Home cooked',
        createdAt,
        updatedAt,
        items: [],
      },
      meta: {},
    });
  });

  it('returns standard update meal log response', async () => {
    const loggedAt = new Date('2026-07-06T13:00:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T13:01:00.000Z');

    update.mockResolvedValue({
      id: 'meal-log-id',
      mealType: MealType.DINNER,
      description: 'Updated meal',
      totalCalories: 500,
      totalProteinGrams: 30,
      totalCarbsGrams: 40,
      totalFatGrams: 20,
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt,
      note: 'Updated note',
      createdAt,
      updatedAt,
      items: [],
    });

    const controller = new MealLogsController(mealLogsService);
    const response = await controller.update(currentUser, 'meal-log-id', {
      mealType: MealType.DINNER,
      loggedAt: loggedAt.toISOString(),
      description: 'Updated meal',
      note: 'Updated note',
    });

    expect(update).toHaveBeenCalledWith('user-id', 'meal-log-id', {
      mealType: MealType.DINNER,
      loggedAt: loggedAt.toISOString(),
      description: 'Updated meal',
      note: 'Updated note',
    });
    expect(response).toEqual({
      success: true,
      message: 'Meal updated successfully',
      data: {
        id: 'meal-log-id',
        mealType: MealType.DINNER,
        description: 'Updated meal',
        totalCalories: 500,
        totalProteinGrams: 30,
        totalCarbsGrams: 40,
        totalFatGrams: 20,
        status: MealLogStatus.LOGGED,
        confidenceLevel: ConfidenceLevel.VERIFIED,
        source: MealLogSource.MANUAL,
        loggedAt,
        note: 'Updated note',
        createdAt,
        updatedAt,
        items: [],
      },
      meta: {},
    });
  });

  it('returns standard delete meal log response', async () => {
    remove.mockResolvedValue(null);

    const controller = new MealLogsController(mealLogsService);
    const response = await controller.remove(currentUser, 'meal-log-id');

    expect(remove).toHaveBeenCalledWith('user-id', 'meal-log-id');
    expect(response).toEqual({
      success: true,
      message: 'Meal deleted successfully',
      data: null,
      meta: {},
    });
  });
});
