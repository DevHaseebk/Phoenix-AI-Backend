import { ExerciseType } from '@prisma/client';
import { estimateExerciseCaloriesBurned } from '../../logs/utils/exercise-calorie-estimate.util';
import {
  ExerciseEstimateItemOutput,
  MealItemSegment,
} from '../ai-provider.interface';

/** Walking cadence used to derive a duration when the user stated only a
 * step count ("5000 steps ki walk") - a standard moderate pace. */
const stepsPerMinute = 100;
/** Fallback duration when the user stated neither duration nor steps -
 * disclosed to the user via the item's assumptions, never silently applied. */
const defaultDurationMinutes = 30;

/**
 * Deterministic keyword mapping from a segmented exercise description to the
 * app's ExerciseType enum (English + Roman Urdu). Backend-first by design
 * (CLAUDE.md §4): no AI call is spent classifying exercise type.
 */
export function inferExerciseType(text: string): ExerciseType {
  const lower = ` ${text.toLowerCase()} `;
  const matchers: Array<[ExerciseType, RegExp]> = [
    [ExerciseType.RUNNING, /\b(run|running|ran|jog|jogging|daur|dor)\b/],
    [ExerciseType.CYCLING, /\b(cycle|cycling|bicycle|bike|biking|saikal)\b/],
    [
      ExerciseType.STRENGTH,
      /\b(gym|weight|weights|weightlifting|strength|lifting|dumbbell|barbell|pushup|push-ups?|kasrat)\b/,
    ],
    [
      ExerciseType.CARDIO,
      /\b(cardio|hiit|aerobics|treadmill|skipping|zumba)\b/,
    ],
    [
      ExerciseType.SPORTS,
      /\b(cricket|football|futsal|badminton|tennis|squash|basketball|volleyball|hockey|swimming|swim)\b/,
    ],
    [ExerciseType.STEPS, /\b(steps?)\b/],
    [
      ExerciseType.WALKING,
      /\b(walk|walking|walked|stroll|sair|sehr|chala|chali|chalna|tehalna)\b/,
    ],
  ];

  for (const [type, pattern] of matchers) {
    if (pattern.test(lower)) {
      return type;
    }
  }

  return ExerciseType.OTHER;
}

/**
 * Turns one EXERCISE segment into a reviewable estimate item. Calories reuse
 * the existing MET formula (logs/utils/exercise-calorie-estimate.util.ts)
 * with the user's current weight - never a second formula, never an AI call.
 * Anything assumed (missing duration, missing weight) is stated in
 * `assumptions` so the user reviews it before confirming.
 */
export function buildExerciseEstimateItem(
  segment: MealItemSegment,
  weightKg: number | null,
): ExerciseEstimateItemOutput {
  const assumptions: string[] = [];
  let durationMinutes = segment.durationMinutes;

  if (durationMinutes === null && segment.steps !== null) {
    durationMinutes = Math.max(1, Math.round(segment.steps / stepsPerMinute));
    assumptions.push(
      `Duration estimated from ${segment.steps} steps (~${stepsPerMinute} steps/min).`,
    );
  }

  if (durationMinutes === null) {
    durationMinutes = defaultDurationMinutes;
    assumptions.push(
      `No duration stated - assumed ${defaultDurationMinutes} minutes. Correct it if that's off.`,
    );
  }

  const exerciseType = inferExerciseType(segment.text);
  let estimatedCaloriesBurned: number | null = null;

  if (weightKg !== null && weightKg > 0) {
    estimatedCaloriesBurned = estimateExerciseCaloriesBurned({
      exerciseType,
      durationMinutes,
      weightKg,
    });
  } else {
    assumptions.push(
      'Calories burned could not be estimated without a logged weight.',
    );
  }

  return {
    name: segment.text.slice(0, 150),
    exerciseType,
    durationMinutes,
    distanceKm: segment.distanceKm,
    steps: segment.steps,
    estimatedCaloriesBurned,
    resolvedDate: segment.date,
    assumptions,
  };
}
