import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FoodItemsService } from './food-items.service';

describe('FoodItemsService.update', () => {
  const update = jest.fn();
  const prisma = {
    foodItem: { update },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only includes the fields actually present in the patch', async () => {
    update.mockResolvedValue({ id: 'food-1', caloriesPer100g: 400 });
    const service = new FoodItemsService(prisma);

    await service.update('food-1', { caloriesPer100g: 400 });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'food-1' },
      data: { caloriesPer100g: 400 },
      include: { aliases: true },
    });
  });

  it('applies every editable nutrition field when all are given', async () => {
    update.mockResolvedValue({ id: 'food-1' });
    const service = new FoodItemsService(prisma);

    await service.update('food-1', {
      caloriesPer100g: 400,
      proteinPer100g: 20,
      carbsPer100g: 30,
      fatPer100g: 10,
      defaultServingGrams: 250,
    });

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
    const service = new FoodItemsService(prisma);

    await service.update('food-1', { proteinPer100g: 22 });

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
    const service = new FoodItemsService(prisma);

    await expect(
      service.update('missing', { caloriesPer100g: 400 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
