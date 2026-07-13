/**
 * Single source of truth for the calorie deficit/surplus formula, shared by
 * the dashboard card and the AI user-context block.
 *
 * deficit (positive) = TDEE + exercise calories burned - calories consumed
 *
 * TDEE already includes the profile's general activity level, so adding
 * logged exercise on top can double-count habitual activity slightly; the
 * app treats logged exercise as on-top-of-baseline effort (matching how the
 * dashboard already reports "calories burned" separately), and every surface
 * presents the number as an estimate, never a precise guarantee.
 */
export function calculateCalorieDeficitKcal(input: {
  tdeeKcal: number | null;
  caloriesConsumed: number;
  exerciseCaloriesBurned: number;
}): number | null {
  if (input.tdeeKcal === null) {
    return null;
  }

  return Math.round(
    input.tdeeKcal + input.exerciseCaloriesBurned - input.caloriesConsumed,
  );
}

/** ~7700 kcal per kg of body fat - the standard rough conversion. */
const kcalPerKg = 7700;
const projectionDays = 28;

/**
 * Rough 4-week weight-change projection from an average daily deficit
 * (positive = projected loss). Explicitly an estimate for framing like
 * "at this rate, roughly X kg over the next 4 weeks" - callers must present
 * it as such (Constitution: never promise guaranteed weight loss).
 */
export function projectFourWeekWeightChangeKg(
  averageDailyDeficitKcal: number,
): number {
  return (
    Math.round(((averageDailyDeficitKcal * projectionDays) / kcalPerKg) * 10) /
    10
  );
}
