import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import type { AiProvider } from '../ai-provider.interface';
import { RagService } from '../rag/rag.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MealPlanService } from './meal-plan.service';

describe('MealPlanService', () => {
  const userFindUnique = jest.fn();
  const groceryFindFirst = jest.fn();
  const groceryUpdate = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    groceryListItem: { findFirst: groceryFindFirst, update: groceryUpdate },
    mealPlan: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const config = { get: jest.fn() } as unknown as ConfigService;
  const aiProvider = {
    generateMealEstimate: jest.fn(),
  } as unknown as AiProvider;
  const ragService = {
    retrieveRelevantChunks: jest.fn(),
  } as unknown as RagService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
      profile: {
        calorieTarget: 1970,
        proteinTargetGrams: 120,
        timezone: 'Asia/Karachi',
      },
    });
  });

  function createService(): MealPlanService {
    return new MealPlanService(prisma, config, aiProvider, ragService);
  }

  it('rejects inactive users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
      profile: null,
    });

    await expect(
      createService().getCurrentPlan('user-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses to toggle a grocery item that belongs to another user's plan", async () => {
    groceryFindFirst.mockResolvedValue(null);

    await expect(
      createService().setGroceryItemChecked('user-id', 'foreign-item', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(groceryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foreign-item', mealPlan: { userId: 'user-id' } },
      }),
    );
    expect(groceryUpdate).not.toHaveBeenCalled();
  });

  it('toggles an owned grocery item', async () => {
    groceryFindFirst.mockResolvedValue({ id: 'item-1' });
    groceryUpdate.mockResolvedValue({
      id: 'item-1',
      itemName: 'Chicken Biryani',
      note: 'for 2 meals this week',
      checked: true,
    });

    const result = await createService().setGroceryItemChecked(
      'user-id',
      'item-1',
      true,
    );

    expect(groceryUpdate).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { checked: true },
      select: { id: true, itemName: true, note: true, checked: true },
    });
    expect(result.checked).toBe(true);
  });
});
