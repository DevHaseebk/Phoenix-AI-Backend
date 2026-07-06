import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  ConfidenceLevel,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MealLogsService } from './meal-logs.service';

describe('MealLogsService', () => {
  const userFindUnique = jest.fn();
  const mealLogCreate = jest.fn();
  const mealLogFindMany = jest.fn();
  const mealLogFindFirst = jest.fn();
  const mealLogUpdate = jest.fn();
  const mealLogDelete = jest.fn();
  const mealLogItemDeleteMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    $transaction: transaction,
    user: {
      findUnique: userFindUnique,
    },
    mealLog: {
      create: mealLogCreate,
      findMany: mealLogFindMany,
      findFirst: mealLogFindFirst,
      update: mealLogUpdate,
      delete: mealLogDelete,
    },
    mealLogItem: {
      deleteMany: mealLogItemDeleteMany,
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    mealLogFindFirst.mockResolvedValue({ id: 'meal-log-id' });
    const transactionClient = {
      mealLog: {
        findFirst: mealLogFindFirst,
        update: mealLogUpdate,
      },
      mealLogItem: {
        deleteMany: mealLogItemDeleteMany,
      },
    };
    transaction.mockImplementation(
      (
        callback: (
          transactionClientArg: typeof transactionClient,
        ) => Promise<unknown>,
      ) => callback(transactionClient),
    );
  });

  it('creates a manual meal log for the current user and calculates totals', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogCreate.mockResolvedValue({
      id: 'meal-log-id',
      mealType: MealType.LUNCH,
      description: 'Chicken biryani and raita',
      totalCalories: new Prisma.Decimal('850'),
      totalProteinGrams: new Prisma.Decimal('45'),
      totalCarbsGrams: new Prisma.Decimal('95'),
      totalFatGrams: new Prisma.Decimal('33'),
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt,
      note: 'Home cooked',
      createdAt,
      updatedAt,
      items: [
        createPrismaMealItem({
          id: 'meal-item-id-1',
          foodName: 'Chicken Biryani',
          portionLabel: 'medium plate',
          quantity: '1',
          calories: '750',
          proteinGrams: '35',
          carbsGrams: '85',
          fatGrams: '28',
          createdAt,
          updatedAt,
        }),
        createPrismaMealItem({
          id: 'meal-item-id-2',
          foodName: 'Raita',
          portionLabel: 'small bowl',
          quantity: '1',
          calories: '100',
          proteinGrams: '10',
          carbsGrams: '10',
          fatGrams: '5',
          createdAt,
          updatedAt,
        }),
      ],
    });

    const service = new MealLogsService(prisma);
    const response = await service.create('user-id', {
      mealType: MealType.LUNCH,
      loggedAt: loggedAt.toISOString(),
      description: 'Chicken biryani and raita',
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
        {
          foodName: 'Raita',
          portionLabel: 'small bowl',
          quantity: 1,
          calories: 100,
          proteinGrams: 10,
          carbsGrams: 10,
          fatGrams: 5,
        },
      ],
    });

    expect(mealLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        mealType: MealType.LUNCH,
        loggedAt,
        source: MealLogSource.MANUAL,
        status: MealLogStatus.LOGGED,
        confidenceLevel: ConfidenceLevel.VERIFIED,
        description: 'Chicken biryani and raita',
        note: 'Home cooked',
        totalCalories: 850,
        totalProteinGrams: 45,
        totalCarbsGrams: 95,
        totalFatGrams: 33,
        items: {
          create: [
            {
              foodName: 'Chicken Biryani',
              portionLabel: 'medium plate',
              quantity: 1,
              calories: 750,
              proteinGrams: 35,
              carbsGrams: 85,
              fatGrams: 28,
              confidenceLevel: ConfidenceLevel.VERIFIED,
            },
            {
              foodName: 'Raita',
              portionLabel: 'small bowl',
              quantity: 1,
              calories: 100,
              proteinGrams: 10,
              carbsGrams: 10,
              fatGrams: 5,
              confidenceLevel: ConfidenceLevel.VERIFIED,
            },
          ],
        },
      },
      select: expect.objectContaining({
        id: true,
        items: expect.any(Object) as object,
      }) as object,
    });
    expect(response).toEqual({
      id: 'meal-log-id',
      mealType: MealType.LUNCH,
      description: 'Chicken biryani and raita',
      totalCalories: 850,
      totalProteinGrams: 45,
      totalCarbsGrams: 95,
      totalFatGrams: 33,
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt,
      note: 'Home cooked',
      createdAt,
      updatedAt,
      items: [
        {
          id: 'meal-item-id-1',
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
        {
          id: 'meal-item-id-2',
          foodName: 'Raita',
          portionLabel: 'small bowl',
          quantity: 1,
          calories: 100,
          proteinGrams: 10,
          carbsGrams: 10,
          fatGrams: 5,
          confidenceLevel: ConfidenceLevel.VERIFIED,
          createdAt,
          updatedAt,
        },
      ],
    });
  });

  it('uses null optional totals when no optional macro values are provided', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogCreate.mockResolvedValue({
      id: 'meal-log-id',
      mealType: MealType.SNACK,
      description: null,
      totalCalories: new Prisma.Decimal('200'),
      totalProteinGrams: new Prisma.Decimal('12'),
      totalCarbsGrams: null,
      totalFatGrams: null,
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt,
      note: null,
      createdAt,
      updatedAt,
      items: [
        createPrismaMealItem({
          id: 'meal-item-id',
          foodName: 'Greek Yogurt',
          portionLabel: null,
          quantity: null,
          calories: '200',
          proteinGrams: '12',
          carbsGrams: null,
          fatGrams: null,
          createdAt,
          updatedAt,
        }),
      ],
    });

    const service = new MealLogsService(prisma);
    const response = await service.create('user-id', {
      mealType: MealType.SNACK,
      items: [
        {
          foodName: 'Greek Yogurt',
          calories: 200,
          proteinGrams: 12,
        },
      ],
    });

    expect(mealLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCalories: 200,
          totalProteinGrams: 12,
          totalCarbsGrams: null,
          totalFatGrams: null,
        }) as object,
      }),
    );
    expect(response.totalCarbsGrams).toBeNull();
    expect(response.totalFatGrams).toBeNull();
  });

  it('lists current user meal logs with filters and default descending order', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogFindMany.mockResolvedValue([
      {
        id: 'meal-log-id',
        mealType: MealType.LUNCH,
        description: 'Chicken biryani',
        totalCalories: new Prisma.Decimal('750'),
        totalProteinGrams: new Prisma.Decimal('35'),
        totalCarbsGrams: new Prisma.Decimal('85'),
        totalFatGrams: new Prisma.Decimal('28'),
        status: MealLogStatus.LOGGED,
        confidenceLevel: ConfidenceLevel.VERIFIED,
        source: MealLogSource.MANUAL,
        loggedAt,
        note: null,
        createdAt,
        updatedAt,
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      },
    ]);

    const service = new MealLogsService(prisma);
    const response = await service.findMany('user-id', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-06T23:59:59.999Z',
      limit: 10,
      mealType: MealType.LUNCH,
    });

    expect(mealLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        mealType: MealType.LUNCH,
        loggedAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-06T23:59:59.999Z'),
        },
      },
      orderBy: { loggedAt: 'desc' },
      take: 10,
      select: expect.any(Object) as object,
    });
    expect(response[0].totalCalories).toBe(750);
    expect(response[0].items[0].calories).toBe(750);
  });

  it('uses default list limit of 30', async () => {
    mealLogFindMany.mockResolvedValue([]);

    const service = new MealLogsService(prisma);
    await service.findMany('user-id', {});

    expect(mealLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
  });

  it('finds one current user meal log with items', async () => {
    const loggedAt = new Date('2026-07-06T12:30:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T12:31:00.000Z');

    mealLogFindFirst.mockResolvedValue(
      createPrismaMealLog({
        id: 'meal-log-id',
        mealType: MealType.LUNCH,
        description: 'Chicken biryani',
        note: 'Home cooked',
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '750',
        totalProteinGrams: '35',
        totalCarbsGrams: '85',
        totalFatGrams: '28',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    const service = new MealLogsService(prisma);
    const response = await service.findOne('user-id', 'meal-log-id');

    expect(mealLogFindFirst).toHaveBeenCalledWith({
      where: { id: 'meal-log-id', userId: 'user-id' },
      select: expect.any(Object) as object,
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0].calories).toBe(750);
  });

  it('rejects missing or non-owned meal logs on find one', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    const service = new MealLogsService(prisma);

    await expect(
      service.findOne('user-id', 'other-meal-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates meal fields without replacing existing items or totals', async () => {
    const loggedAt = new Date('2026-07-06T13:00:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T13:01:00.000Z');

    mealLogUpdate.mockResolvedValue(
      createPrismaMealLog({
        id: 'meal-log-id',
        mealType: MealType.DINNER,
        description: 'Updated meal',
        note: 'Updated note',
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '750',
        totalProteinGrams: '35',
        totalCarbsGrams: '85',
        totalFatGrams: '28',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id',
            foodName: 'Chicken Biryani',
            portionLabel: 'medium plate',
            quantity: '1',
            calories: '750',
            proteinGrams: '35',
            carbsGrams: '85',
            fatGrams: '28',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    const service = new MealLogsService(prisma);
    const response = await service.update('user-id', 'meal-log-id', {
      mealType: MealType.DINNER,
      loggedAt: loggedAt.toISOString(),
      description: 'Updated meal',
      note: 'Updated note',
    });

    expect(mealLogUpdate).toHaveBeenCalledWith({
      where: { id: 'meal-log-id' },
      data: {
        mealType: MealType.DINNER,
        loggedAt,
        description: 'Updated meal',
        note: 'Updated note',
      },
      select: expect.any(Object) as object,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(response.totalCalories).toBe(750);
    expect(response.items).toHaveLength(1);
  });

  it('replaces items and recalculates totals in a transaction', async () => {
    const loggedAt = new Date('2026-07-06T13:00:00.000Z');
    const createdAt = new Date('2026-07-06T12:31:00.000Z');
    const updatedAt = new Date('2026-07-06T13:01:00.000Z');

    mealLogUpdate.mockResolvedValue(
      createPrismaMealLog({
        id: 'meal-log-id',
        mealType: MealType.DINNER,
        description: 'Updated meal',
        note: 'Updated note',
        loggedAt,
        createdAt,
        updatedAt,
        totalCalories: '600',
        totalProteinGrams: '40',
        totalCarbsGrams: '55',
        totalFatGrams: '22',
        items: [
          createPrismaMealItem({
            id: 'meal-item-id-new',
            foodName: 'Grilled Chicken',
            portionLabel: '1 plate',
            quantity: '1',
            calories: '600',
            proteinGrams: '40',
            carbsGrams: '55',
            fatGrams: '22',
            createdAt,
            updatedAt,
          }),
        ],
      }),
    );

    const service = new MealLogsService(prisma);
    const response = await service.update('user-id', 'meal-log-id', {
      mealType: MealType.DINNER,
      loggedAt: loggedAt.toISOString(),
      description: 'Updated meal',
      note: 'Updated note',
      items: [
        {
          foodName: 'Grilled Chicken',
          portionLabel: '1 plate',
          quantity: 1,
          calories: 600,
          proteinGrams: 40,
          carbsGrams: 55,
          fatGrams: 22,
        },
      ],
    });

    expect(transaction).toHaveBeenCalled();
    expect(mealLogItemDeleteMany).toHaveBeenCalledWith({
      where: { mealLogId: 'meal-log-id' },
    });
    expect(mealLogUpdate).toHaveBeenCalledWith({
      where: { id: 'meal-log-id' },
      data: {
        mealType: MealType.DINNER,
        loggedAt,
        description: 'Updated meal',
        note: 'Updated note',
        totalCalories: 600,
        totalProteinGrams: 40,
        totalCarbsGrams: 55,
        totalFatGrams: 22,
        items: {
          create: [
            {
              foodName: 'Grilled Chicken',
              portionLabel: '1 plate',
              quantity: 1,
              calories: 600,
              proteinGrams: 40,
              carbsGrams: 55,
              fatGrams: 22,
              confidenceLevel: ConfidenceLevel.VERIFIED,
            },
          ],
        },
      },
      select: expect.any(Object) as object,
    });
    expect(response.totalCalories).toBe(600);
    expect(response.items[0].foodName).toBe('Grilled Chicken');
  });

  it('rejects missing or non-owned meal logs on update', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    const service = new MealLogsService(prisma);

    await expect(
      service.update('user-id', 'other-meal-id', {
        mealType: MealType.DINNER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mealLogUpdate).not.toHaveBeenCalled();
  });

  it('hard deletes current user meal logs', async () => {
    mealLogDelete.mockResolvedValue({ id: 'meal-log-id' });

    const service = new MealLogsService(prisma);
    const response = await service.remove('user-id', 'meal-log-id');

    expect(mealLogDelete).toHaveBeenCalledWith({
      where: { id: 'meal-log-id' },
      select: { id: true },
    });
    expect(response).toBeNull();
  });

  it('rejects missing or non-owned meal logs on delete', async () => {
    mealLogFindFirst.mockResolvedValue(null);

    const service = new MealLogsService(prisma);

    await expect(
      service.remove('user-id', 'other-meal-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mealLogDelete).not.toHaveBeenCalled();
  });

  it('rejects inactive or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new MealLogsService(prisma);

    await expect(
      service.create('user-id', {
        mealType: MealType.LUNCH,
        items: [
          {
            foodName: 'Chicken Biryani',
            calories: 750,
            proteinGrams: 35,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mealLogCreate).not.toHaveBeenCalled();
  });

  function createPrismaMealItem(input: {
    id: string;
    foodName: string;
    portionLabel: string | null;
    quantity: string | null;
    calories: string;
    proteinGrams: string;
    carbsGrams: string | null;
    fatGrams: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: input.id,
      foodName: input.foodName,
      portionLabel: input.portionLabel,
      quantity:
        input.quantity === null ? null : new Prisma.Decimal(input.quantity),
      calories: new Prisma.Decimal(input.calories),
      proteinGrams: new Prisma.Decimal(input.proteinGrams),
      carbsGrams:
        input.carbsGrams === null ? null : new Prisma.Decimal(input.carbsGrams),
      fatGrams:
        input.fatGrams === null ? null : new Prisma.Decimal(input.fatGrams),
      confidenceLevel: ConfidenceLevel.VERIFIED,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  function createPrismaMealLog(input: {
    id: string;
    mealType: MealType;
    description: string | null;
    note: string | null;
    loggedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    totalCalories: string;
    totalProteinGrams: string;
    totalCarbsGrams: string | null;
    totalFatGrams: string | null;
    items: ReturnType<typeof createPrismaMealItem>[];
  }) {
    return {
      id: input.id,
      mealType: input.mealType,
      description: input.description,
      totalCalories: new Prisma.Decimal(input.totalCalories),
      totalProteinGrams: new Prisma.Decimal(input.totalProteinGrams),
      totalCarbsGrams:
        input.totalCarbsGrams === null
          ? null
          : new Prisma.Decimal(input.totalCarbsGrams),
      totalFatGrams:
        input.totalFatGrams === null
          ? null
          : new Prisma.Decimal(input.totalFatGrams),
      status: MealLogStatus.LOGGED,
      confidenceLevel: ConfidenceLevel.VERIFIED,
      source: MealLogSource.MANUAL,
      loggedAt: input.loggedAt,
      note: input.note,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      items: input.items,
    };
  }
});
