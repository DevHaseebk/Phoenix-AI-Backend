import {
  getLocalDateForTimezone,
  getTodayRangeForTimezone,
} from '../../dashboard/dashboard-timezone';

export type HabitKey = 'MEAL_LOGGING' | 'WATER_LOGGING' | 'EXERCISE_LOGGING';

/** Minimum distinct logged days (any type) below which a review is "partial". */
export const notEnoughDataThresholdDays = 3;

export interface WeeklyReviewStats {
  avgCalories: number;
  avgProteinGrams: number;
  avgSteps: number;
  avgWaterMl: number;
  startWeightKg: number | null;
  endWeightKg: number | null;
  weightChangeKg: number | null;
  /** 0-100: meal-logged days / 7, matching dashboard's percentage convention. */
  consistencyRate: number;
  mealLoggingDays: number;
  waterLoggingDays: number;
  exerciseLoggingDays: number;
  weightLoggingDays: number;
  /** null when the user has no protein target set. */
  proteinTargetMetDays: number | null;
  /** Union of distinct local dates with any log at all, out of 7. */
  totalLoggingDays: number;
  bestHabit: HabitKey | null;
  weakestHabit: HabitKey | null;
}

export interface WeeklyLogInputs {
  timezone: string;
  proteinTargetGrams: number | null;
  mealLogs: Array<{
    loggedAt: Date;
    totalCalories: number;
    totalProteinGrams: number;
  }>;
  waterLogs: Array<{ loggedAt: Date; amountMl: number }>;
  exerciseLogs: Array<{ loggedAt: Date; steps: number | null }>;
  weightLogs: Array<{ loggedAt: Date; weightKg: number }>;
}

const daysPerWeek = 7;

/**
 * Pure stats computation - no DB access here, see review.service.ts for the
 * raw MealLog/WaterLog/ExerciseLog/WeightLog queries this consumes. Mirrors
 * dashboard.service.ts's getSummary() aggregation approach (same timezone
 * util, same distinct-local-date counting idea) but for a fixed Monday-Sunday
 * week rather than a trailing N-day window.
 */
export function computeWeeklyStats(input: WeeklyLogInputs): WeeklyReviewStats {
  const mealDates = buildDateSet(input.mealLogs, input.timezone);
  const waterDates = buildDateSet(input.waterLogs, input.timezone);
  const exerciseDates = buildDateSet(input.exerciseLogs, input.timezone);
  const weightDates = buildDateSet(input.weightLogs, input.timezone);

  const totalCalories = sumBy(input.mealLogs, (log) => log.totalCalories);
  const totalProteinGrams = sumBy(
    input.mealLogs,
    (log) => log.totalProteinGrams,
  );
  const totalWaterMl = sumBy(input.waterLogs, (log) => log.amountMl);
  const totalSteps = sumBy(input.exerciseLogs, (log) => log.steps ?? 0);

  const sortedWeightLogs = [...input.weightLogs].sort(
    (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime(),
  );
  const startWeightKg =
    sortedWeightLogs.length >= 2 ? sortedWeightLogs[0].weightKg : null;
  const endWeightKg =
    sortedWeightLogs.length >= 2
      ? sortedWeightLogs[sortedWeightLogs.length - 1].weightKg
      : null;
  const weightChangeKg =
    startWeightKg === null || endWeightKg === null
      ? null
      : roundOne(endWeightKg - startWeightKg);

  const proteinTargetMetDays =
    input.proteinTargetGrams === null
      ? null
      : countProteinTargetMetDays(
          input.mealLogs,
          input.timezone,
          input.proteinTargetGrams,
        );

  const totalLoggingDays = new Set([
    ...mealDates,
    ...waterDates,
    ...exerciseDates,
    ...weightDates,
  ]).size;

  const { bestHabit, weakestHabit } = determineHabits({
    MEAL_LOGGING: mealDates.size,
    WATER_LOGGING: waterDates.size,
    EXERCISE_LOGGING: exerciseDates.size,
  });

  return {
    avgCalories: roundOne(totalCalories / daysPerWeek),
    avgProteinGrams: roundOne(totalProteinGrams / daysPerWeek),
    avgSteps: Math.round(totalSteps / daysPerWeek),
    avgWaterMl: Math.round(totalWaterMl / daysPerWeek),
    startWeightKg,
    endWeightKg,
    weightChangeKg,
    consistencyRate: Math.round((mealDates.size / daysPerWeek) * 100),
    mealLoggingDays: mealDates.size,
    waterLoggingDays: waterDates.size,
    exerciseLoggingDays: exerciseDates.size,
    weightLoggingDays: weightDates.size,
    proteinTargetMetDays,
    totalLoggingDays,
    bestHabit,
    weakestHabit,
  };
}

/**
 * Best/weakest habit: compares meal/water/exercise logged-day counts against
 * each other (judgment call - the task doesn't mandate a single "correct"
 * comparison method). Ties resolve by a fixed priority order (meal > water >
 * exercise, the order the product doc lists them in) - "best" prefers the
 * earliest-priority habit at the max count, "weakest" the latest-priority
 * habit at the min count, so a 3-way tie never flags meal-logging (the most
 * foundational habit) as the weakest. An all-equal result (including
 * all-zero) has no meaningful signal, so both are null.
 */
function determineHabits(counts: Record<HabitKey, number>): {
  bestHabit: HabitKey | null;
  weakestHabit: HabitKey | null;
} {
  const priority: HabitKey[] = [
    'MEAL_LOGGING',
    'WATER_LOGGING',
    'EXERCISE_LOGGING',
  ];
  const values = priority.map((key) => counts[key]);
  const max = Math.max(...values);
  const min = Math.min(...values);

  if (max === min) {
    return { bestHabit: null, weakestHabit: null };
  }

  const bestHabit = priority.find((key) => counts[key] === max) ?? null;
  const weakestHabit =
    [...priority].reverse().find((key) => counts[key] === min) ?? null;

  return { bestHabit, weakestHabit };
}

function buildDateSet(
  logs: Array<{ loggedAt: Date }>,
  timezone: string,
): Set<string> {
  return new Set(
    logs.map((log) => getLocalDateForTimezone(log.loggedAt, timezone)),
  );
}

function sumBy<TItem>(items: TItem[], select: (item: TItem) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function countProteinTargetMetDays(
  mealLogs: Array<{ loggedAt: Date; totalProteinGrams: number }>,
  timezone: string,
  proteinTargetGrams: number,
): number {
  const proteinByDate = mealLogs.reduce<Record<string, number>>(
    (totals, log) => {
      const date = getLocalDateForTimezone(log.loggedAt, timezone);
      totals[date] = (totals[date] ?? 0) + log.totalProteinGrams;

      return totals;
    },
    {},
  );

  return Object.values(proteinByDate).filter(
    (total) => total >= proteinTargetGrams,
  ).length;
}

/**
 * Normalizes any given date to the Monday of its containing calendar week
 * (plain calendar-date arithmetic - safe without timezone conversion since
 * this operates on an already-resolved local date string, not a real instant).
 */
export function mondayOfWeek(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = asUtc.getUTCDay() === 0 ? 7 : asUtc.getUTCDay();
  const monday = new Date(asUtc.getTime() - (isoWeekday - 1) * 86_400_000);

  return formatUtcDate(monday);
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);

  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Resolves the Monday-Sunday week to generate a review for: the given
 * weekStart normalized to its Monday, or (when omitted) the most recently
 * completed week - this week's Monday minus 7 days, since the current week
 * is still in progress by definition.
 */
export function resolveWeekStartDate(
  timezone: string,
  now: Date,
  requestedWeekStart?: string,
): string {
  if (requestedWeekStart) {
    return mondayOfWeek(requestedWeekStart);
  }

  const todayLocalDate = getTodayRangeForTimezone(timezone, now).date;
  const thisWeekMonday = mondayOfWeek(todayLocalDate);

  return addDaysToLocalDate(thisWeekMonday, -daysPerWeek);
}

export function getWeekEndDate(weekStartDate: string): string {
  return addDaysToLocalDate(weekStartDate, daysPerWeek - 1);
}

/** A week has "ended" once the user's local today is strictly after its Sunday. */
export function hasWeekEnded(
  weekEndDate: string,
  timezone: string,
  now: Date,
): boolean {
  const todayLocalDate = getTodayRangeForTimezone(timezone, now).date;

  return todayLocalDate > weekEndDate;
}

function formatUtcDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
