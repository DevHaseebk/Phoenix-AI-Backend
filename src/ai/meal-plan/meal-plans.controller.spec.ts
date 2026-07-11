import { MealPlanService } from './meal-plan.service';
import { MealPlansController } from './meal-plans.controller';

describe('MealPlansController', () => {
  const generateForUser = jest.fn();
  const getCurrentPlan = jest.fn();
  const setGroceryItemChecked = jest.fn();
  const mealPlanService = {
    generateForUser,
    getCurrentPlan,
    setGroceryItemChecked,
  } as unknown as MealPlanService;
  const currentUser = { userId: 'user-id', email: 'user@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a plan for the current user only', async () => {
    generateForUser.mockResolvedValue({ id: 'plan-1' });
    const controller = new MealPlansController(mealPlanService);

    const response = await controller.generate(currentUser as never);

    expect(generateForUser).toHaveBeenCalledWith('user-id');
    expect(response.data).toEqual({ id: 'plan-1' });
  });

  it('returns the current plan (or null) for the current user', async () => {
    getCurrentPlan.mockResolvedValue(null);
    const controller = new MealPlansController(mealPlanService);

    const response = await controller.current(currentUser as never);

    expect(getCurrentPlan).toHaveBeenCalledWith('user-id');
    expect(response.data).toBeNull();
  });

  it('toggles a grocery item, scoped to the current user', async () => {
    setGroceryItemChecked.mockResolvedValue({ id: 'item-1', checked: true });
    const controller = new MealPlansController(mealPlanService);

    const response = await controller.updateGroceryItem(
      currentUser as never,
      'item-1',
      { checked: true },
    );

    expect(setGroceryItemChecked).toHaveBeenCalledWith(
      'user-id',
      'item-1',
      true,
    );
    expect(response.data).toEqual({ id: 'item-1', checked: true });
  });
});
