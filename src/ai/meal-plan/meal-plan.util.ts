// Pure Planning Mode logic (docs/02_Product_Bible.md §15.7) - meal-count
// determination, deterministic budget splitting, DB-first food selection
// with a variety cap, and grocery-list derivation. No Prisma/AI calls here;
// meal-plan.service.ts orchestrates. Same pure-function + orchestrator split
// as user-state/, nudges/, and food/.

export interface SlotBudget {
  dayOfWeek: number;
  mealSlotIndex: number;
  mealSlotLabel: string;
  calories: number;
  proteinGrams: number;
}

export interface FoodCandidate {
  id: string;
  name: string;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  servingDescription: string;
  /** Pakistani/restaurant-pack or founder-reviewed items get a selection bonus. */
  preferred: boolean;
}

export interface SelectedMeal extends SlotBudget {
  source: 'FOOD_DB' | 'AI_ESTIMATE';
  foodDescription: string;
  actualCalories: number;
  actualProteinGrams: number;
  actualCarbsGrams: number | null;
  actualFatGrams: number | null;
}

export const mealPlanThresholds = {
  planDays: 7,
  historyDays: 14,
  /** Need at least this many logged days to trust history over the default. */
  minHistoryDaysForAverage: 3,
  defaultMealsPerDay: 3,
  minMealsPerDay: 2,
  maxMealsPerDay: 5,
  /** A candidate portion may be scaled between these factors of its default serving. */
  minPortionScale: 0.5,
  maxPortionScale: 2,
  portionScaleStep: 0.25,
  /** Reject a candidate whose scaled calories are further than this from the slot budget. */
  maxCalorieDeviationRatio: 0.25,
  /** Hard variety cap: the same dish may appear at most this many times per plan. */
  maxDishRepeats: 2,
} as const;

/**
 * Typical meals-per-day from recent history: the rounded average of distinct
 * meal counts over days that actually have logs (a day with zero logs says
 * "didn't log", not "ate zero meals", so those days are excluded). Falls
 * back to 3 when fewer than minHistoryDaysForAverage logged days exist, and
 * clamps to [2, 5] so one outlier grazing-day can't produce a 1- or 8-slot plan.
 */
export function determineMealsPerDay(mealCountsByLoggedDay: number[]): number {
  if (
    mealCountsByLoggedDay.length < mealPlanThresholds.minHistoryDaysForAverage
  ) {
    return mealPlanThresholds.defaultMealsPerDay;
  }

  const average =
    mealCountsByLoggedDay.reduce((total, count) => total + count, 0) /
    mealCountsByLoggedDay.length;

  return clamp(
    Math.round(average),
    mealPlanThresholds.minMealsPerDay,
    mealPlanThresholds.maxMealsPerDay,
  );
}

/**
 * Deterministic daily budget split - pure math, zero AI calls.
 *
 * Weighting: breakfast-light. For 3+ meals the first slot carries a 0.8
 * weight and every other slot 1.0 (Pakistani eating patterns skew
 * lunch/dinner-heavy; an even split would over-assign breakfast). For 2
 * meals the split is even. Calories round to the nearest 10 and protein to
 * the nearest gram, with the final slot absorbing rounding remainders so
 * the day's totals always equal the targets exactly.
 */
export function splitDailyBudget(
  calorieTarget: number,
  proteinTargetGrams: number,
  mealCount: number,
): Array<{ calories: number; proteinGrams: number }> {
  const weights = Array.from({ length: mealCount }, (_, index) =>
    mealCount >= 3 && index === 0 ? 0.8 : 1,
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);

  const slots: Array<{ calories: number; proteinGrams: number }> = [];
  let caloriesAssigned = 0;
  let proteinAssigned = 0;

  for (let index = 0; index < mealCount; index += 1) {
    if (index === mealCount - 1) {
      slots.push({
        calories: calorieTarget - caloriesAssigned,
        proteinGrams: proteinTargetGrams - proteinAssigned,
      });
      break;
    }

    const calories =
      Math.round((calorieTarget * weights[index]) / totalWeight / 10) * 10;
    const proteinGrams = Math.round(
      (proteinTargetGrams * weights[index]) / totalWeight,
    );
    slots.push({ calories, proteinGrams });
    caloriesAssigned += calories;
    proteinAssigned += proteinGrams;
  }

  return slots;
}

/** "Breakfast/Lunch/Dinner" reads better than "Meal 1..3" for the common
 * 3-meal case; any other count gets neutral numbered labels since guessing
 * which of 4 slots is the "snack" would be arbitrary. */
export function buildSlotLabels(mealCount: number): string[] {
  if (mealCount === 3) {
    return ['Breakfast', 'Lunch', 'Dinner'];
  }

  return Array.from({ length: mealCount }, (_, index) => `Meal ${index + 1}`);
}

export function buildWeekSlotBudgets(
  calorieTarget: number,
  proteinTargetGrams: number,
  mealCount: number,
): SlotBudget[] {
  const dailySplit = splitDailyBudget(
    calorieTarget,
    proteinTargetGrams,
    mealCount,
  );
  const labels = buildSlotLabels(mealCount);
  const slots: SlotBudget[] = [];

  for (let day = 0; day < mealPlanThresholds.planDays; day += 1) {
    for (let slotIndex = 0; slotIndex < mealCount; slotIndex += 1) {
      slots.push({
        dayOfWeek: day,
        mealSlotIndex: slotIndex,
        mealSlotLabel: labels[slotIndex],
        calories: dailySplit[slotIndex].calories,
        proteinGrams: dailySplit[slotIndex].proteinGrams,
      });
    }
  }

  return slots;
}

/**
 * DB-first selection. For each slot, every candidate is tried at a portion
 * scale (quantized to 0.25x steps, clamped 0.5x-2x of its default serving)
 * that best approaches the slot's calorie budget; candidates whose scaled
 * calories still deviate more than 25% are unsuitable. Among suitable
 * candidates the lowest score wins:
 *   score = |calorie gap|/budget + 0.5 * |protein gap|/protein budget
 *           + 0.2 * timesAlreadyUsed - 0.1 if preferred (Pakistani pack)
 * The usage penalty spreads variety; the hard cap (maxDishRepeats = 2)
 * guarantees no dish appears more than twice per plan. Slots with no
 * suitable candidate are returned in `aiNeededSlots` for the single batched
 * AI fallback call.
 */
export function selectFoodsForPlan(
  candidates: FoodCandidate[],
  slots: SlotBudget[],
): { selected: SelectedMeal[]; aiNeededSlots: SlotBudget[] } {
  const usageCounts = new Map<string, number>();
  const selected: SelectedMeal[] = [];
  const aiNeededSlots: SlotBudget[] = [];

  for (const slot of slots) {
    let best: {
      candidate: FoodCandidate;
      scale: number;
      score: number;
    } | null = null;

    for (const candidate of candidates) {
      const usage = usageCounts.get(candidate.id) ?? 0;

      if (usage >= mealPlanThresholds.maxDishRepeats) {
        continue;
      }

      if (candidate.caloriesPerServing <= 0) {
        continue;
      }

      const rawScale = slot.calories / candidate.caloriesPerServing;
      const scale = clamp(
        Math.round(rawScale / mealPlanThresholds.portionScaleStep) *
          mealPlanThresholds.portionScaleStep,
        mealPlanThresholds.minPortionScale,
        mealPlanThresholds.maxPortionScale,
      );
      const scaledCalories = candidate.caloriesPerServing * scale;
      const calorieDeviation =
        Math.abs(scaledCalories - slot.calories) / slot.calories;

      if (calorieDeviation > mealPlanThresholds.maxCalorieDeviationRatio) {
        continue;
      }

      const scaledProtein = candidate.proteinPerServing * scale;
      const proteinDeviation =
        Math.abs(scaledProtein - slot.proteinGrams) /
        Math.max(slot.proteinGrams, 1);
      const score =
        calorieDeviation +
        0.5 * proteinDeviation +
        0.2 * usage -
        (candidate.preferred ? 0.1 : 0);

      if (!best || score < best.score) {
        best = { candidate, scale, score };
      }
    }

    if (!best) {
      aiNeededSlots.push(slot);
      continue;
    }

    usageCounts.set(
      best.candidate.id,
      (usageCounts.get(best.candidate.id) ?? 0) + 1,
    );

    const { candidate, scale } = best;
    selected.push({
      ...slot,
      source: 'FOOD_DB',
      foodDescription: describePortion(candidate, scale),
      actualCalories: Math.round(candidate.caloriesPerServing * scale),
      actualProteinGrams: roundOne(candidate.proteinPerServing * scale),
      actualCarbsGrams:
        candidate.carbsPerServing === null
          ? null
          : roundOne(candidate.carbsPerServing * scale),
      actualFatGrams:
        candidate.fatPerServing === null
          ? null
          : roundOne(candidate.fatPerServing * scale),
    });
  }

  return { selected, aiNeededSlots };
}

function describePortion(candidate: FoodCandidate, scale: number): string {
  if (scale === 1) {
    return `${candidate.name} (${candidate.servingDescription})`;
  }

  return `${candidate.name} (${formatScale(scale)} x ${candidate.servingDescription})`;
}

function formatScale(scale: number): string {
  return Number.isInteger(scale)
    ? String(scale)
    : scale.toFixed(2).replace(/0$/, '');
}

/**
 * Grocery derivation: one line per distinct dish, deduped by dish name
 * (portion multipliers stripped), noting how many meals it covers.
 * Ingredient-level extraction from free-text dish names would need either a
 * recipe database or an extra AI call per plan - deliberately out of scope
 * for MVP (docs/02_Product_Bible.md §18.7 keeps recipe decomposition out of
 * ordinary flows), so the checklist is dish-level.
 */
export function deriveGroceryList(
  meals: Array<Pick<SelectedMeal, 'foodDescription'>>,
): Array<{ itemName: string; note: string }> {
  const counts = new Map<string, number>();

  for (const meal of meals) {
    const dishName = extractDishName(meal.foodDescription);
    counts.set(dishName, (counts.get(dishName) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemName, count]) => ({
      itemName,
      note:
        count === 1 ? 'for 1 meal this week' : `for ${count} meals this week`,
    }));
}

function extractDishName(foodDescription: string): string {
  const parenIndex = foodDescription.indexOf(' (');
  return parenIndex === -1
    ? foodDescription.trim()
    : foodDescription.slice(0, parenIndex).trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
