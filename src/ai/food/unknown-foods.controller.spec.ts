import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { FoodItemsService } from './food-items.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';
import { UnknownFoodsController } from './unknown-foods.controller';

describe('UnknownFoodsController', () => {
  it('is gated behind AdminGuard (re-secured from plain JwtAuthGuard, Admin Panel Prompt #5)', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      UnknownFoodsController,
    ) as unknown[] | undefined;

    expect(guards).toContain(AdminGuard);
  });

  const list = jest.fn();
  const findById = jest.fn();
  const setStatus = jest.fn();
  const create = jest.fn();
  const update = jest.fn();

  const unknownFoodQueueService = {
    list,
    findById,
    setStatus,
  } as unknown as UnknownFoodQueueService;
  const foodItemsService = { create, update } as unknown as FoodItemsService;

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
    expect(setStatus).toHaveBeenCalledWith('queue-1', 'APPROVED', 'food-1');
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

  describe('editFoodItem', () => {
    it('updates the linked food item of an approved queue item', async () => {
      findById.mockResolvedValue({
        id: 'queue-1',
        status: 'APPROVED',
        linkedFoodItemId: 'food-1',
      });
      update.mockResolvedValue({ id: 'food-1', caloriesPer100g: 400 });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      const response = await controller.editFoodItem('queue-1', {
        caloriesPer100g: 400,
      });

      expect(update).toHaveBeenCalledWith('food-1', { caloriesPer100g: 400 });
      expect(response.data).toEqual({ id: 'food-1', caloriesPer100g: 400 });
    });

    it('rejects an empty patch', async () => {
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.editFoodItem('queue-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(findById).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a nonexistent queue item', async () => {
      findById.mockResolvedValue(null);
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.editFoodItem('missing', { caloriesPer100g: 400 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a non-approved queue item (e.g. still PENDING)', async () => {
      findById.mockResolvedValue({
        id: 'queue-1',
        status: 'PENDING',
        linkedFoodItemId: null,
      });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.editFoodItem('queue-1', { caloriesPer100g: 400 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an approved queue item that somehow has no linkedFoodItemId', async () => {
      findById.mockResolvedValue({
        id: 'queue-1',
        status: 'APPROVED',
        linkedFoodItemId: null,
      });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.editFoodItem('queue-1', { caloriesPer100g: 400 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('restoreToPending', () => {
    it('moves a REJECTED item back to PENDING', async () => {
      findById.mockResolvedValue({ id: 'queue-1', status: 'REJECTED' });
      setStatus.mockResolvedValue({ id: 'queue-1', status: 'PENDING' });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      const response = await controller.restoreToPending('queue-1');

      expect(setStatus).toHaveBeenCalledWith('queue-1', 'PENDING');
      expect(response.data).toEqual({ id: 'queue-1', status: 'PENDING' });
    });

    it('moves a NEEDS_RESEARCH item back to PENDING', async () => {
      findById.mockResolvedValue({ id: 'queue-1', status: 'NEEDS_RESEARCH' });
      setStatus.mockResolvedValue({ id: 'queue-1', status: 'PENDING' });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await controller.restoreToPending('queue-1');

      expect(setStatus).toHaveBeenCalledWith('queue-1', 'PENDING');
    });

    it('refuses to restore an APPROVED item', async () => {
      findById.mockResolvedValue({ id: 'queue-1', status: 'APPROVED' });
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.restoreToPending('queue-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(setStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a nonexistent queue item', async () => {
      findById.mockResolvedValue(null);
      const controller = new UnknownFoodsController(
        unknownFoodQueueService,
        foodItemsService,
      );

      await expect(
        controller.restoreToPending('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(setStatus).not.toHaveBeenCalled();
    });
  });
});
