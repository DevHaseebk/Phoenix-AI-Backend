import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AdminFoodItemsController } from './admin-food-items.controller';
import { FoodItemsService } from '../ai/food/food-items.service';

describe('AdminFoodItemsController', () => {
  const listForReview = jest.fn();
  const reviewUpdate = jest.fn();
  const bulkApprove = jest.fn();
  const foodItemsService = {
    listForReview,
    reviewUpdate,
    bulkApprove,
  } as unknown as FoodItemsService;
  const adminUser = { userId: 'admin-1' } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards list query params to the service', async () => {
    listForReview.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const controller = new AdminFoodItemsController(foodItemsService);

    await controller.list({ page: 1, limit: 20 });

    expect(listForReview).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('forwards the nutrition patch and calling admin id for an individual edit', async () => {
    reviewUpdate.mockResolvedValue({ id: 'food-1' });
    const controller = new AdminFoodItemsController(foodItemsService);

    await controller.update('food-1', { caloriesPer100g: 250 }, adminUser);

    expect(reviewUpdate).toHaveBeenCalledWith(
      'food-1',
      { caloriesPer100g: 250 },
      'admin-1',
    );
  });

  it('forwards the exact id list and calling admin id for bulk-approve', async () => {
    bulkApprove.mockResolvedValue({ count: 2 });
    const controller = new AdminFoodItemsController(foodItemsService);

    const response = await controller.bulkApprove(
      { ids: ['food-1', 'food-2'] },
      adminUser,
    );

    expect(bulkApprove).toHaveBeenCalledWith(['food-1', 'food-2'], 'admin-1');
    expect(response.data).toEqual({ count: 2 });
  });
});
