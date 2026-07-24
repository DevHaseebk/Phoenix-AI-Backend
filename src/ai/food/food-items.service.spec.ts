import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FoodItemsService } from './food-items.service';

describe('FoodItemsService.update', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const prisma = {
    foodItem: { findUnique, update },
  } as unknown as PrismaService;
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      caloriesPer100g: new Prisma.Decimal(300),
      proteinPer100g: new Prisma.Decimal(15),
      carbsPer100g: new Prisma.Decimal(20),
      fatPer100g: new Prisma.Decimal(10),
      defaultServingGrams: new Prisma.Decimal(200),
    });
  });

  it('only includes the fields actually present in the patch', async () => {
    update.mockResolvedValue({ id: 'food-1', caloriesPer100g: 400 });
    const service = new FoodItemsService(prisma, auditLog);

    await service.update('food-1', { caloriesPer100g: 400 }, 'admin-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: { caloriesPer100g: 400 },
      include: { aliases: true },
    });
  });

  it('applies every editable nutrition field when all are given', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma, auditLog);

    await service.update(
      'food-1',
      {
        caloriesPer100g: 400,
        proteinPer100g: 20,
        carbsPer100g: 30,
        fatPer100g: 10,
        defaultServingGrams: 250,
      },
      'admin-1',
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: {
        caloriesPer100g: 400,
        proteinPer100g: 20,
        carbsPer100g: 30,
        fatPer100g: 10,
        defaultServingGrams: 250,
      },
      include: { aliases: true },
    });
  });

  it('never touches name/category/aliases', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma, auditLog);

    await service.update('food-1', { proteinPer100g: 22 }, 'admin-1');

    const calls = update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const call = calls[0][0];
    expect(call.data).not.toHaveProperty('name');
    expect(call.data).not.toHaveProperty('category');
    expect(call.data).not.toHaveProperty('aliases');
  });

  it('throws NotFoundException when the food item does not exist', async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.19.3',
      }),
    );
    const service = new FoodItemsService(prisma, auditLog);

    await expect(
      service.update('missing', { caloriesPer100g: 400 }, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(record).not.toHaveBeenCalled();
  });

  it('records an AuditLogEntry with the before/after nutrition values', async () => {
    update.mockResolvedValue({ id: 'food-1', caloriesPer100g: 400 });
    const service = new FoodItemsService(prisma, auditLog);

    await service.update('food-1', { caloriesPer100g: 400 }, 'admin-1');

    expect(record).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'food-item.edit',
      targetType: 'FoodItem',
      targetId: 'food-1',
      metadata: {
        before: {
          caloriesPer100g: 300,
          proteinPer100g: 15,
          carbsPer100g: 20,
          fatPer100g: 10,
          defaultServingGrams: 200,
        },
        after: { caloriesPer100g: 400 },
      },
    });
  });
});

describe('FoodItemsService.reviewUpdate', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const prisma = {
    foodItem: { findUnique, update },
  } as unknown as PrismaService;
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      caloriesPer100g: new Prisma.Decimal(300),
      proteinPer100g: new Prisma.Decimal(15),
      carbsPer100g: new Prisma.Decimal(20),
      fatPer100g: new Prisma.Decimal(10),
      defaultServingGrams: new Prisma.Decimal(200),
      verified: false,
      source: 'AI_ESTIMATE',
    });
  });

  it('applies the nutrition patch and always reclassifies to verified/FOUNDER_REVIEWED', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma, auditLog);

    await service.reviewUpdate('food-1', { caloriesPer100g: 260 }, 'admin-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: {
        caloriesPer100g: 260,
        verified: true,
        source: 'FOUNDER_REVIEWED',
      },
      include: { aliases: true },
    });
  });

  it('reclassifies even with an empty patch (accept-as-is via the edit form)', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma, auditLog);

    await service.reviewUpdate('food-1', {}, 'admin-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: { verified: true, source: 'FOUNDER_REVIEWED' },
      include: { aliases: true },
    });
  });

  it('throws NotFoundException when the food item does not exist', async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.19.3',
      }),
    );
    const service = new FoodItemsService(prisma, auditLog);

    await expect(
      service.reviewUpdate('missing', { caloriesPer100g: 400 }, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(record).not.toHaveBeenCalled();
  });

  it('records an AuditLogEntry reflecting the review reclassification', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma, auditLog);

    await service.reviewUpdate('food-1', { caloriesPer100g: 260 }, 'admin-1');

    expect(record).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'food-item.review-update',
      targetType: 'FoodItem',
      targetId: 'food-1',
      metadata: {
        before: {
          caloriesPer100g: 300,
          proteinPer100g: 15,
          carbsPer100g: 20,
          fatPer100g: 10,
          defaultServingGrams: 200,
          verified: false,
          source: 'AI_ESTIMATE',
        },
        after: {
          caloriesPer100g: 260,
          verified: true,
          source: 'FOUNDER_REVIEWED',
        },
      },
    });
  });
});

describe('FoodItemsService.listForReview', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const prisma = {
    foodItem: { findMany, count },
  } as unknown as PrismaService;
  const auditLog = { record: jest.fn() } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('defaults to source: AI_ESTIMATE, verified: false when nothing is specified', async () => {
    const service = new FoodItemsService(prisma, auditLog);

    await service.listForReview({});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'AI_ESTIMATE', verified: false },
      }),
    );
  });

  it('honors an explicit source/verified override', async () => {
    const service = new FoodItemsService(prisma, auditLog);

    await service.listForReview({ source: 'USDA', verified: true });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'USDA', verified: true },
      }),
    );
  });

  it('paginates using page/limit', async () => {
    const service = new FoodItemsService(prisma, auditLog);

    await service.listForReview({ page: 3, limit: 10 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe('FoodItemsService.bulkApprove', () => {
  const updateMany = jest.fn();
  const prisma = {
    foodItem: { updateMany },
  } as unknown as PrismaService;
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks exactly the given ids verified/FOUNDER_REVIEWED without touching nutrition', async () => {
    updateMany.mockResolvedValue({ count: 2 });
    const service = new FoodItemsService(prisma, auditLog);

    const result = await service.bulkApprove(['food-1', 'food-2'], 'admin-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['food-1', 'food-2'] } },
      data: { verified: true, source: 'FOUNDER_REVIEWED' },
    });
    expect(result).toEqual({ count: 2 });
    expect(record).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'food-item.bulk-approve',
      targetType: 'FoodItem',
      targetId: 'food-1,food-2',
      metadata: { ids: ['food-1', 'food-2'], count: 2 },
    });
  });

  it('no-ops on an empty id list without hitting the database', async () => {
    const service = new FoodItemsService(prisma, auditLog);

    const result = await service.bulkApprove([], 'admin-1');

    expect(updateMany).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
  });
});
