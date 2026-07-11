import { NotFoundException } from '@nestjs/common';
import { FoodItemsService } from './food-items.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';
import { UnknownFoodsController } from './unknown-foods.controller';

describe('UnknownFoodsController', () => {
  const list = jest.fn();
  const findById = jest.fn();
  const setStatus = jest.fn();
  const create = jest.fn();

  const unknownFoodQueueService = {
    list,
    findById,
    setStatus,
  } as unknown as UnknownFoodQueueService;
  const foodItemsService = { create } as unknown as FoodItemsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists queue items, forwarding the status filter', async () => {
    list.mockResolvedValue([{ id: 'queue-1' }]);
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    const response = await controller.list({ status: 'PENDING' });

    expect(list).toHaveBeenCalledWith('PENDING');
    expect(response.data).toEqual([{ id: 'queue-1' }]);
  });

  it('approves a queue item: creates a FoodItem (with the queue rawText as an alias) and marks APPROVED', async () => {
    findById.mockResolvedValue({
      id: 'queue-1',
      rawText: 'chicken karahi spicy',
    });
    create.mockResolvedValue({ id: 'food-1', name: 'Chicken Karahi' });
    setStatus.mockResolvedValue({ id: 'queue-1', status: 'APPROVED' });
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    const response = await controller.approve('queue-1', {
      name: 'Chicken Karahi',
      category: 'MAIN_DISH',
      caloriesPer100g: 190,
      proteinPer100g: 16,
      defaultServingDescription: '1 bowl',
      defaultServingGrams: 300,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chicken Karahi',
        source: 'FOUNDER_REVIEWED',
        verified: true,
        aliases: expect.arrayContaining(['chicken karahi spicy']) as string[],
      }),
    );
    expect(setStatus).toHaveBeenCalledWith('queue-1', 'APPROVED');
    expect(response.data).toEqual({
      foodItem: { id: 'food-1', name: 'Chicken Karahi' },
      queueItem: { id: 'queue-1', status: 'APPROVED' },
    });
  });

  it('throws NotFoundException when approving a queue item that does not exist', async () => {
    findById.mockResolvedValue(null);
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    await expect(
      controller.approve('missing', {
        name: 'X',
        category: 'OTHER',
        caloriesPer100g: 100,
        proteinPer100g: 5,
        defaultServingDescription: '1 serving',
        defaultServingGrams: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a queue item', async () => {
    setStatus.mockResolvedValue({ id: 'queue-1', status: 'REJECTED' });
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    const response = await controller.reject('queue-1');

    expect(setStatus).toHaveBeenCalledWith('queue-1', 'REJECTED');
    expect(response.data).toEqual({ id: 'queue-1', status: 'REJECTED' });
  });

  it('throws NotFoundException when rejecting a queue item that does not exist', async () => {
    setStatus.mockResolvedValue(null);
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    await expect(controller.reject('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks a queue item as needing research', async () => {
    setStatus.mockResolvedValue({ id: 'queue-1', status: 'NEEDS_RESEARCH' });
    const controller = new UnknownFoodsController(
      unknownFoodQueueService,
      foodItemsService,
    );

    const response = await controller.needsResearch('queue-1');

    expect(setStatus).toHaveBeenCalledWith('queue-1', 'NEEDS_RESEARCH');
    expect(response.data).toEqual({ id: 'queue-1', status: 'NEEDS_RESEARCH' });
  });
});
