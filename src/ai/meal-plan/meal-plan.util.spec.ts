import {
  buildSlotLabels,
  buildWeekSlotBudgets,
  determineMealsPerDay,
  deriveGroceryList,
  FoodCandidate,
  selectFoodsForPlan,
  splitDailyBudget,
} from './meal-plan.util';

describe('determineMealsPerDay', () => {
  it('defaults to 3 when there is no history', () => {
    expect(determineMealsPerDay([])).toBe(3);
  });

  it('defaults to 3 when fewer than 3 logged days exist', () => {
    expect(determineMealsPerDay([4, 4])).toBe(3);
  });

  it('uses the rounded average of logged days', () => {
    expect(determineMealsPerDay([2, 2, 2, 2])).toBe(2);
    expect(determineMealsPerDay([4, 4, 4, 5])).toBe(4);
    expect(determineMealsPerDay([3, 4, 4])).toBe(4);
  });

  it('clamps to the 2-5 range', () => {
    expect(determineMealsPerDay([1, 1, 1])).toBe(2);
    expect(determineMealsPerDay([8, 8, 8])).toBe(5);
  });
});

describe('splitDailyBudget', () => {
  it('splits evenly for 2 meals and sums exactly to the targets', () => {
    const slots = splitDailyBudget(2000, 120, 2);

    expect(slots).toHaveLength(2);
    expect(slots.reduce((total, slot) => total + slot.calories, 0)).toBe(2000);
    expect(slots.reduce((total, slot) => total + slot.proteinGrams, 0)).toBe(
      120,
    );
    expect(slots[0].calories).toBe(1000);
  });

  it('gives the first slot a lighter share for 3+ meals (breakfast-light)', () => {
    const slots = splitDailyBudget(1970, 120, 3);

    expect(slots).toHaveLength(3);
    expect(slots[0].calories).toBeLessThan(slots[1].calories);
    expect(slots.reduce((total, slot) => total + slot.calories, 0)).toBe(1970);
    expect(slots.reduce((total, slot) => total + slot.proteinGrams, 0)).toBe(
      120,
    );
  });

  it('always sums exactly to targets across meal counts', () => {
    for (const mealCount of [2, 3, 4, 5]) {
      const slots = splitDailyBudget(1837, 113, mealCount);
      expect(slots.reduce((total, slot) => total + slot.calories, 0)).toBe(
        1837,
      );
      expect(slots.reduce((total, slot) => total + slot.proteinGrams, 0)).toBe(
        113,
      );
    }
  });
});

describe('buildSlotLabels', () => {
  it('uses Breakfast/Lunch/Dinner for exactly 3 meals', () => {
    expect(buildSlotLabels(3)).toEqual(['Breakfast', 'Lunch', 'Dinner']);
  });

  it('uses numbered labels for other counts', () => {
    expect(buildSlotLabels(2)).toEqual(['Meal 1', 'Meal 2']);
    expect(buildSlotLabels(4)).toEqual([
      'Meal 1',
      'Meal 2',
      'Meal 3',
      'Meal 4',
    ]);
  });
});

function candidate(
  overrides: Partial<FoodCandidate> & { id: string },
): FoodCandidate {
  return {
    name: overrides.id,
    caloriesPerServing: 500,
    proteinPerServing: 25,
    carbsPerServing: 40,
    fatPerServing: 15,
    servingDescription: '1 plate',
    preferred: false,
    ...overrides,
  };
}

describe('selectFoodsForPlan', () => {
  const slots = buildWeekSlotBudgets(1970, 120, 3);

  it('fills every slot from the DB when suitable candidates exist', () => {
    const candidates = [
      candidate({ id: 'a', caloriesPerServing: 500, proteinPerServing: 30 }),
      candidate({ id: 'b', caloriesPerServing: 600, proteinPerServing: 35 }),
      candidate({ id: 'c', caloriesPerServing: 550, proteinPerServing: 28 }),
      candidate({ id: 'd', caloriesPerServing: 450, proteinPerServing: 32 }),
      candidate({ id: 'e', caloriesPerServing: 700, proteinPerServing: 40 }),
      candidate({ id: 'f', caloriesPerServing: 480, proteinPerServing: 26 }),
      candidate({ id: 'g', caloriesPerServing: 520, proteinPerServing: 34 }),
      candidate({ id: 'h', caloriesPerServing: 650, proteinPerServing: 30 }),
      candidate({ id: 'i', caloriesPerServing: 400, proteinPerServing: 22 }),
      candidate({ id: 'j', caloriesPerServing: 580, proteinPerServing: 38 }),
      candidate({ id: 'k', caloriesPerServing: 620, proteinPerServing: 27 }),
    ];

    const { selected, aiNeededSlots } = selectFoodsForPlan(candidates, slots);

    expect(aiNeededSlots).toHaveLength(0);
    expect(selected).toHaveLength(21);
    expect(selected.every((meal) => meal.source === 'FOOD_DB')).toBe(true);
  });

  it('never uses the same dish more than twice across the plan', () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      candidate({ id: `dish-${index}`, caloriesPerServing: 500 + index * 15 }),
    );

    const { selected } = selectFoodsForPlan(candidates, slots);
    const usage = new Map<string, number>();
    for (const meal of selected) {
      const dish = meal.foodDescription.split(' (')[0];
      usage.set(dish, (usage.get(dish) ?? 0) + 1);
    }

    for (const count of usage.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('sends slots to AI fallback when no candidate fits the budget', () => {
    // Only a tiny snack-sized item exists: even at max 2x scale it cannot
    // reach a ~525-700 kcal meal budget within the 25% tolerance.
    const candidates = [candidate({ id: 'tiny', caloriesPerServing: 80 })];

    const { selected, aiNeededSlots } = selectFoodsForPlan(candidates, slots);

    expect(selected).toHaveLength(0);
    expect(aiNeededSlots).toHaveLength(21);
  });

  it('scales portions toward the slot budget and reports scaled nutrition', () => {
    const candidates = [
      candidate({
        id: 'plate',
        caloriesPerServing: 400,
        proteinPerServing: 20,
      }),
      candidate({
        id: 'other',
        caloriesPerServing: 660,
        proteinPerServing: 32,
      }),
      candidate({
        id: 'third',
        caloriesPerServing: 520,
        proteinPerServing: 30,
      }),
      candidate({
        id: 'fourth',
        caloriesPerServing: 480,
        proteinPerServing: 28,
      }),
      candidate({
        id: 'fifth',
        caloriesPerServing: 610,
        proteinPerServing: 35,
      }),
      candidate({
        id: 'sixth',
        caloriesPerServing: 445,
        proteinPerServing: 25,
      }),
      candidate({
        id: 'seventh',
        caloriesPerServing: 560,
        proteinPerServing: 33,
      }),
      candidate({
        id: 'eighth',
        caloriesPerServing: 390,
        proteinPerServing: 24,
      }),
      candidate({
        id: 'ninth',
        caloriesPerServing: 505,
        proteinPerServing: 29,
      }),
      candidate({
        id: 'tenth',
        caloriesPerServing: 675,
        proteinPerServing: 31,
      }),
      candidate({
        id: 'eleventh',
        caloriesPerServing: 430,
        proteinPerServing: 27,
      }),
    ];

    const { selected } = selectFoodsForPlan(candidates, slots);

    for (const meal of selected) {
      const deviation =
        Math.abs(meal.actualCalories - meal.calories) / meal.calories;
      expect(deviation).toBeLessThanOrEqual(0.25 + 1e-9);
    }
  });

  it('prefers Pakistani-pack (preferred) items on otherwise similar fits', () => {
    const [firstSlot] = slots;
    const candidates = [
      candidate({
        id: 'generic',
        caloriesPerServing: firstSlot.calories,
        proteinPerServing: firstSlot.proteinGrams,
      }),
      candidate({
        id: 'desi',
        caloriesPerServing: firstSlot.calories,
        proteinPerServing: firstSlot.proteinGrams,
        preferred: true,
      }),
    ];

    const { selected } = selectFoodsForPlan(candidates, [firstSlot]);

    expect(selected[0].foodDescription.startsWith('desi')).toBe(true);
  });
});

describe('deriveGroceryList', () => {
  it('dedupes by dish name (portion multipliers stripped) and counts meals covered', () => {
    const items = deriveGroceryList([
      { foodDescription: 'Chicken Biryani (1 medium plate)' },
      { foodDescription: 'Chicken Biryani (1.5 x 1 medium plate)' },
      { foodDescription: 'Daal Masoor (1 bowl)' },
    ]);

    expect(items).toEqual([
      { itemName: 'Chicken Biryani', note: 'for 2 meals this week' },
      { itemName: 'Daal Masoor', note: 'for 1 meal this week' },
    ]);
  });

  it('handles AI-sourced descriptions without a portion suffix', () => {
    const items = deriveGroceryList([
      { foodDescription: 'Grilled chicken with sabzi' },
      { foodDescription: 'Grilled chicken with sabzi' },
      { foodDescription: 'Grilled chicken with sabzi' },
    ]);

    expect(items).toEqual([
      { itemName: 'Grilled chicken with sabzi', note: 'for 3 meals this week' },
    ]);
  });
});
