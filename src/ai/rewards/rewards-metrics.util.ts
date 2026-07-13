import { GoalType } from '@prisma/client';
import {
  addDaysToLocalDate,
  getLocalDateForTimezone,
} from '../../dashboard/dashboard-timezone';
import { userStateThresholds } from '../user-state/user-state.util';

export interface UserBadgeMetrics {
  mealLogCount: number;
  waterLogCount: number;
  exerciseLogCount: number;
  weightLogCount: number;
  /** Distinct local dates with at least one log of any type, all-time. */
  totalActiveDays: number;
  /** Consecutive days with at least one log, ending today (0 if none today or yesterday did not chain in). */
  currentStreakDays: number;
  /** max(0, startWeightKg - currentWeightKg) - only meaningful for a LOSE_WEIGHT goal, 0 otherwise. */
  weightLossKg: number;
  /** 1 if the user's current weight has reached their target (direction-aware), else 0. */
  goalAchieved: number;
  totalExerciseMinutes: number;
  totalDistanceKm: number;
  /** Days with meal + water + exercise + weight all logged. */
  fullDayComboCount: number;
  /** Days with at least 3 of the 4 log types logged. */
  tripleThreatCount: number;
  /** Non-overlapping 7-day windows with meal + water logged every day. */
  perfectWeekCount: number;
  /** Count of gaps of userStateThresholds.comebackMinGapDays+ days between active dates, each followed by a return. Mirrors UserStateService's Comeback detection (see user-state.util.ts), applied across full history instead of just "today". */
  comebackCount: number;
  totalChatMessages: number;
  /** All-time days where total logged protein met the user's target (0 if no target set). */
  proteinTargetHitDays: number;
  /** All-time days where total logged water met the water target. */
  waterTargetHitDays: number;
}

export interface RewardsMetricsInput {
  timezone: string;
  now: Date;
  goalType: GoalType | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  proteinTargetGrams: number | null;
  waterTargetMl: number;
  mealLogs: Array<{ loggedAt: Date; totalProteinGrams: number }>;
  waterLogs: Array<{ loggedAt: Date; amountMl: number }>;
  exerciseLogs: Array<{
    loggedAt: Date;
    durationMinutes: number;
    distanceKm: number | null;
  }>;
  weightLogs: Array<{ loggedAt: Date }>;
  totalChatMessages: number;
}

const maintenanceToleranceFraction =
  userStateThresholds.maintenanceToleranceFraction;

/**
 * Pure computation - no DB access here, see rewards.service.ts for the raw
 * Prisma queries this consumes. Deterministic, zero AI calls, per
 * docs/17_Rewards_Badge_Design.md's design (backend-first, CLAUDE.md §4).
 */
export function computeUserBadgeMetrics(
  input: RewardsMetricsInput,
): UserBadgeMetrics {
  const mealDates = buildDateSet(input.mealLogs, input.timezone);
  const waterDates = buildDateSet(input.waterLogs, input.timezone);
  const exerciseDates = buildDateSet(input.exerciseLogs, input.timezone);
  const weightDates = buildDateSet(input.weightLogs, input.timezone);
  const allDates = new Set([
    ...mealDates,
    ...waterDates,
    ...exerciseDates,
    ...weightDates,
  ]);

  const todayLocalDate = getLocalDateForTimezone(input.now, input.timezone);

  return {
    mealLogCount: input.mealLogs.length,
    waterLogCount: input.waterLogs.length,
    exerciseLogCount: input.exerciseLogs.length,
    weightLogCount: input.weightLogs.length,
    totalActiveDays: allDates.size,
    currentStreakDays: computeCurrentStreakDays(allDates, todayLocalDate),
    weightLossKg: computeWeightLossKg(input),
    goalAchieved: computeGoalAchieved(input),
    totalExerciseMinutes: sumBy(
      input.exerciseLogs,
      (log) => log.durationMinutes,
    ),
    totalDistanceKm: sumBy(input.exerciseLogs, (log) => log.distanceKm ?? 0),
    fullDayComboCount: countComboDays(
      allDates,
      mealDates,
      waterDates,
      exerciseDates,
      weightDates,
      4,
    ),
    tripleThreatCount: countComboDays(
      allDates,
      mealDates,
      waterDates,
      exerciseDates,
      weightDates,
      3,
    ),
    perfectWeekCount: countPerfectWeeks(mealDates, waterDates, todayLocalDate),
    comebackCount: countComebacks(allDates),
    totalChatMessages: input.totalChatMessages,
    proteinTargetHitDays: countTargetHitDays(
      input.mealLogs,
      input.timezone,
      (log) => log.totalProteinGrams,
      input.proteinTargetGrams,
    ),
    waterTargetHitDays: countTargetHitDays(
      input.waterLogs,
      input.timezone,
      (log) => log.amountMl,
      input.waterTargetMl,
    ),
  };
}

function computeWeightLossKg(input: RewardsMetricsInput): number {
  if (
    input.goalType !== GoalType.LOSE_WEIGHT ||
    input.startWeightKg === null ||
    input.currentWeightKg === null
  ) {
    return 0;
  }

  return Math.max(0, roundOne(input.startWeightKg - input.currentWeightKg));
}

/**
 * Direction-aware: for LOSE_WEIGHT, "achieved" means current has dropped to
 * or below target; for GAIN_WEIGHT, current has risen to or above target;
 * for MAINTAIN_WEIGHT, current is within the same tolerance band
 * UserStateService's Maintenance check uses (see user-state.util.ts) - never
 * a second definition of "at goal".
 */
function computeGoalAchieved(input: RewardsMetricsInput): number {
  if (input.currentWeightKg === null || input.targetWeightKg === null) {
    return 0;
  }

  if (input.goalType === GoalType.LOSE_WEIGHT) {
    return input.currentWeightKg <= input.targetWeightKg ? 1 : 0;
  }

  if (input.goalType === GoalType.GAIN_WEIGHT) {
    return input.currentWeightKg >= input.targetWeightKg ? 1 : 0;
  }

  const bound = input.targetWeightKg * maintenanceToleranceFraction;

  return Math.abs(input.currentWeightKg - input.targetWeightKg) <= bound
    ? 1
    : 0;
}

function computeCurrentStreakDays(
  allDates: Set<string>,
  todayLocalDate: string,
): number {
  let streak = 0;
  let cursor = todayLocalDate;

  while (allDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToLocalDate(cursor, -1);
  }

  return streak;
}

function countComboDays(
  allDates: Set<string>,
  mealDates: Set<string>,
  waterDates: Set<string>,
  exerciseDates: Set<string>,
  weightDates: Set<string>,
  minCategories: number,
): number {
  let count = 0;

  for (const date of allDates) {
    const categoriesLogged =
      Number(mealDates.has(date)) +
      Number(waterDates.has(date)) +
      Number(exerciseDates.has(date)) +
      Number(weightDates.has(date));

    if (categoriesLogged >= minCategories) {
      count += 1;
    }
  }

  return count;
}

/**
 * Counts non-overlapping 7-consecutive-local-day windows where every day had
 * both a meal and a water log. Scans from the earliest activity date through
 * today; on a match, jumps 7 days ahead (windows don't overlap), otherwise
 * advances one day at a time.
 */
function countPerfectWeeks(
  mealDates: Set<string>,
  waterDates: Set<string>,
  todayLocalDate: string,
): number {
  const qualifyingDates = [...mealDates].filter((date) => waterDates.has(date));

  if (qualifyingDates.length === 0) {
    return 0;
  }

  const earliestDate = qualifyingDates.sort()[0];
  let cursor = earliestDate;
  let count = 0;

  while (cursor <= todayLocalDate) {
    const windowHasAllSevenDays = Array.from({ length: 7 }, (_, offset) =>
      addDaysToLocalDate(cursor, offset),
    ).every((date) => mealDates.has(date) && waterDates.has(date));

    if (windowHasAllSevenDays) {
      count += 1;
      cursor = addDaysToLocalDate(cursor, 7);
    } else {
      cursor = addDaysToLocalDate(cursor, 1);
    }
  }

  return count;
}

/**
 * Counts gaps of userStateThresholds.comebackMinGapDays+ days between
 * consecutive active dates across the user's full history - each such gap
 * followed by a return is one "comeback", mirroring UserStateService's
 * single-point-in-time Comeback check (user-state.util.ts) but applied
 * retrospectively across the whole timeline since no state history is
 * persisted anywhere in this schema.
 */
function countComebacks(allDates: Set<string>): number {
  const sortedDates = [...allDates].sort();

  if (sortedDates.length < 2) {
    return 0;
  }

  let count = 0;

  for (let i = 1; i < sortedDates.length; i += 1) {
    const gapDays = daysBetweenLocalDates(sortedDates[i - 1], sortedDates[i]);

    if (gapDays >= userStateThresholds.comebackMinGapDays) {
      count += 1;
    }
  }

  return count;
}

function daysBetweenLocalDates(earlier: string, later: string): number {
  const earlierUtc = Date.parse(`${earlier}T00:00:00.000Z`);
  const laterUtc = Date.parse(`${later}T00:00:00.000Z`);

  return Math.round((laterUtc - earlierUtc) / (24 * 60 * 60 * 1000));
}

function countTargetHitDays<TLog extends { loggedAt: Date }>(
  logs: TLog[],
  timezone: string,
  select: (log: TLog) => number,
  target: number | null,
): number {
  if (target === null) {
    return 0;
  }

  const totalsByDate = new Map<string, number>();

  for (const log of logs) {
    const date = getLocalDateForTimezone(log.loggedAt, timezone);
    totalsByDate.set(date, (totalsByDate.get(date) ?? 0) + select(log));
  }

  return [...totalsByDate.values()].filter((total) => total >= target).length;
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
