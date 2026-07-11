import { PrismaService } from '../../prisma/prisma.service';
import { FoodMatchingService } from './food-matching.service';

describe('FoodMatchingService', () => {
  const foodAliasFindFirst = jest.fn();
  const foodAliasFindMany = jest.fn();
  const prisma = {
    foodAlias: {
      findFirst: foodAliasFindFirst,
      findMany: foodAliasFindMany,
    },
  } as unknown as PrismaService;

  const chickenBiryaniFoodItem = {
    id: 'food-1',
    name: 'Chicken Biryani',
    caloriesPer100g: 165,
    proteinPer100g: 8,
    carbsPer100g: 18,
    fatPer100g: 6.5,
    defaultServingDescription: '1 medium plate',
    defaultServingGrams: 400,
    confidence: 'MEDIUM',
    source: 'AI_ESTIMATE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves an exact alias match and scales nutrition from the default serving', async () => {
    foodAliasFindFirst.mockResolvedValue({
      alias: 'chicken biryani',
      foodItem: chickenBiryaniFoodItem,
    });

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('chicken biryani');

    expect(foodAliasFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alias: { in: ['chicken biryani'] } },
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.structured.intent).toBe('MEAL_ESTIMATE');
    expect(result!.matchTier).toBe('EXACT');
    // Default serving (400g) at 165 kcal/100g = 660 kcal.
    expect(result!.structured.totals.calories).toBe(660);
    expect(result!.structured.items[0].assumptions.length).toBeGreaterThan(0);
  });

  it('resolves an alias match via a known alternate spelling', async () => {
    foodAliasFindFirst.mockResolvedValue({
      alias: 'murgh biryani',
      foodItem: chickenBiryaniFoodItem,
    });

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('murgh biryani');

    expect(result).not.toBeNull();
    expect(result!.foodItemId).toBe('food-1');
  });

  it('scales nutrition from an explicit gram portion instead of the default serving', async () => {
    foodAliasFindFirst.mockResolvedValue({
      alias: 'chicken biryani',
      foodItem: chickenBiryaniFoodItem,
    });

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('chicken biryani 200g');

    // 200g at 165 kcal/100g = 330 kcal, no default-serving assumption noted.
    expect(result!.structured.totals.calories).toBe(330);
    expect(result!.structured.items[0].assumptions).toEqual([]);
  });

  it('returns null when no exact or containment match exists', async () => {
    foodAliasFindFirst.mockResolvedValue(null);
    foodAliasFindMany.mockResolvedValue([
      { alias: 'chicken biryani', foodItem: chickenBiryaniFoodItem },
    ]);

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('some completely unknown dish');

    expect(result).toBeNull();
  });

  it('finds a match via whole-word substring containment when portion words surround it', async () => {
    foodAliasFindFirst.mockResolvedValue(null);
    foodAliasFindMany.mockResolvedValue([
      { alias: 'chicken biryani', foodItem: chickenBiryaniFoodItem },
    ]);

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch(
      '2 medium plates chicken biryani spicy',
    );

    expect(result).not.toBeNull();
    expect(result!.foodItemId).toBe('food-1');
    expect(result!.matchTier).toBe('CONTAINMENT');
  });

  it('scales nutrition using an explicit segment portion (quantity/unit) instead of re-parsing the text', async () => {
    foodAliasFindFirst.mockResolvedValue({
      alias: 'chicken biryani',
      foodItem: chickenBiryaniFoodItem,
    });

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('chicken biryani', undefined, {
      quantity: '200',
      unit: 'g',
    });

    // 200g at 165 kcal/100g = 330 kcal, no default-serving assumption noted.
    expect(result!.structured.totals.calories).toBe(330);
    expect(result!.structured.items[0].assumptions).toEqual([]);
  });

  it('scales a count-based explicit portion (e.g. "2 large egg") by quantity, not a default serving', async () => {
    const eggFoodItem = {
      id: 'food-2',
      name: 'Boiled Egg',
      caloriesPer100g: 155,
      proteinPer100g: 13,
      carbsPer100g: 1.1,
      fatPer100g: 11,
      defaultServingDescription: '1 large egg',
      defaultServingGrams: 50,
      confidence: 'MEDIUM',
      source: 'AI_ESTIMATE',
    };
    foodAliasFindFirst.mockResolvedValue({
      alias: 'boiled egg',
      foodItem: eggFoodItem,
    });

    const service = new FoodMatchingService(prisma);
    const result = await service.resolveMatch('boiled egg', undefined, {
      quantity: '2',
      unit: 'large egg',
    });

    // 2 eggs x 50g = 100g at 155 kcal/100g = 155 kcal.
    expect(result!.structured.totals.calories).toBe(155);
    expect(result!.structured.items[0].quantityText).toBe('2 x 1 large egg');
  });
});
