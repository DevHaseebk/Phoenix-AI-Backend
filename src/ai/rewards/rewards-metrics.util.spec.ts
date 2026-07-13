import { GoalType } from '@prisma/client';
import {
  computeUserBadgeMetrics,
  type RewardsMetricsInput,
} from './rewards-metrics.util';

const timezone = 'UTC';

function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

function baseInput(
  overrides: Partial<RewardsMetricsInput> = {},
): RewardsMetricsInput {
  return {
    timezone,
    now: utcNoon('2026-07-13'),
    goalType: GoalType.LOSE_WEIGHT,
    startWeightKg: null,
    currentWeightKg: null,
    targetWeightKg: null,
    proteinTargetGrams: null,
    waterTargetMl: 3000,
    mealLogs: [],
    waterLogs: [],
    exerciseLogs: [],
    weightLogs: [],
    totalChatMessages: 0,
    ...overrides,
  };
}

describe('computeUserBadgeMetrics', () => {
  it('counts cumulative logs per type', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        mealLogs: [
          { loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 20 },
          { loggedAt: utcNoon('2026-07-11'), totalProteinGrams: 20 },
        ],
        waterLogs: [{ loggedAt: utcNoon('2026-07-10'), amountMl: 500 }],
        exerciseLogs: [
          {
            loggedAt: utcNoon('2026-07-10'),
            durationMinutes: 30,
            distanceKm: 3,
          },
        ],
        weightLogs: [{ loggedAt: utcNoon('2026-07-10') }],
      }),
    );

    expect(metrics.mealLogCount).toBe(2);
    expect(metrics.waterLogCount).toBe(1);
    expect(metrics.exerciseLogCount).toBe(1);
    expect(metrics.weightLogCount).toBe(1);
    expect(metrics.totalExerciseMinutes).toBe(30);
    expect(metrics.totalDistanceKm).toBe(3);
  });

  it('counts distinct active days across log types', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        mealLogs: [
          { loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 20 },
          { loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 20 },
        ],
        waterLogs: [{ loggedAt: utcNoon('2026-07-11'), amountMl: 500 }],
      }),
    );

    expect(metrics.totalActiveDays).toBe(2);
  });

  it('computes a consecutive current streak ending today, broken by a gap', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        now: utcNoon('2026-07-13'),
        waterLogs: [
          { loggedAt: utcNoon('2026-07-13'), amountMl: 500 },
          { loggedAt: utcNoon('2026-07-12'), amountMl: 500 },
          { loggedAt: utcNoon('2026-07-11'), amountMl: 500 },
          // gap on 2026-07-10
          { loggedAt: utcNoon('2026-07-09'), amountMl: 500 },
        ],
      }),
    );

    expect(metrics.currentStreakDays).toBe(3);
  });

  it('returns a zero streak when nothing was logged today', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        now: utcNoon('2026-07-13'),
        waterLogs: [{ loggedAt: utcNoon('2026-07-12'), amountMl: 500 }],
      }),
    );

    expect(metrics.currentStreakDays).toBe(0);
  });

  it('computes weightLossKg only for a LOSE_WEIGHT goal, clamped at 0', () => {
    const losing = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.LOSE_WEIGHT,
        startWeightKg: 100,
        currentWeightKg: 92.4,
      }),
    );

    expect(losing.weightLossKg).toBe(7.6);

    const gaining = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.GAIN_WEIGHT,
        startWeightKg: 60,
        currentWeightKg: 65,
      }),
    );

    expect(gaining.weightLossKg).toBe(0);

    const regained = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.LOSE_WEIGHT,
        startWeightKg: 100,
        currentWeightKg: 104,
      }),
    );

    expect(regained.weightLossKg).toBe(0);
  });

  it('flags goalAchieved direction-aware for lose/gain/maintain goals', () => {
    const loseAchieved = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.LOSE_WEIGHT,
        currentWeightKg: 69,
        targetWeightKg: 70,
      }),
    );

    expect(loseAchieved.goalAchieved).toBe(1);

    const loseNotYet = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.LOSE_WEIGHT,
        currentWeightKg: 71,
        targetWeightKg: 70,
      }),
    );

    expect(loseNotYet.goalAchieved).toBe(0);

    const gainAchieved = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.GAIN_WEIGHT,
        currentWeightKg: 66,
        targetWeightKg: 65,
      }),
    );

    expect(gainAchieved.goalAchieved).toBe(1);

    const maintainWithinTolerance = computeUserBadgeMetrics(
      baseInput({
        goalType: GoalType.MAINTAIN_WEIGHT,
        currentWeightKg: 70.5,
        targetWeightKg: 70,
      }),
    );

    expect(maintainWithinTolerance.goalAchieved).toBe(1);
  });

  it('counts full-day combo and triple-threat days', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        mealLogs: [{ loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 20 }],
        waterLogs: [
          { loggedAt: utcNoon('2026-07-10'), amountMl: 500 },
          { loggedAt: utcNoon('2026-07-11'), amountMl: 500 },
        ],
        exerciseLogs: [
          {
            loggedAt: utcNoon('2026-07-10'),
            durationMinutes: 20,
            distanceKm: null,
          },
          {
            loggedAt: utcNoon('2026-07-11'),
            durationMinutes: 20,
            distanceKm: null,
          },
        ],
        weightLogs: [{ loggedAt: utcNoon('2026-07-10') }],
      }),
    );

    // 2026-07-10 has all 4 categories; 2026-07-11 has water + exercise only (2).
    expect(metrics.fullDayComboCount).toBe(1);
    expect(metrics.tripleThreatCount).toBe(1);
  });

  it('counts a perfect week only when 7 consecutive days have both meal and water logs', () => {
    const mealLogs = Array.from({ length: 7 }, (_, i) => ({
      loggedAt: utcNoon(`2026-07-0${i + 1}`),
      totalProteinGrams: 20,
    }));
    const waterLogs = mealLogs.map((log) => ({
      loggedAt: log.loggedAt,
      amountMl: 500,
    }));

    const fullWeek = computeUserBadgeMetrics(
      baseInput({ now: utcNoon('2026-07-13'), mealLogs, waterLogs }),
    );

    expect(fullWeek.perfectWeekCount).toBe(1);

    const brokenWeek = computeUserBadgeMetrics(
      baseInput({
        now: utcNoon('2026-07-13'),
        mealLogs: mealLogs.slice(0, 6),
        waterLogs: waterLogs.slice(0, 6),
      }),
    );

    expect(brokenWeek.perfectWeekCount).toBe(0);
  });

  it('counts a comeback for each gap of 14+ days between active dates', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        now: utcNoon('2026-07-13'),
        waterLogs: [
          { loggedAt: utcNoon('2026-06-01'), amountMl: 500 },
          // 20-day gap -> comeback #1
          { loggedAt: utcNoon('2026-06-21'), amountMl: 500 },
          { loggedAt: utcNoon('2026-06-22'), amountMl: 500 },
          // 15-day gap -> comeback #2
          { loggedAt: utcNoon('2026-07-07'), amountMl: 500 },
        ],
      }),
    );

    expect(metrics.comebackCount).toBe(2);
  });

  it('does not count a comeback for a short gap under the threshold', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        waterLogs: [
          { loggedAt: utcNoon('2026-07-01'), amountMl: 500 },
          { loggedAt: utcNoon('2026-07-05'), amountMl: 500 },
        ],
      }),
    );

    expect(metrics.comebackCount).toBe(0);
  });

  it('counts protein and water target-hit days, and returns 0 with no target set', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({
        proteinTargetGrams: 100,
        mealLogs: [
          { loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 60 },
          { loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 50 }, // day total 110, hits target
          { loggedAt: utcNoon('2026-07-11'), totalProteinGrams: 40 }, // misses
        ],
        waterLogs: [
          { loggedAt: utcNoon('2026-07-10'), amountMl: 3000 }, // hits target exactly
          { loggedAt: utcNoon('2026-07-11'), amountMl: 1000 },
        ],
      }),
    );

    expect(metrics.proteinTargetHitDays).toBe(1);
    expect(metrics.waterTargetHitDays).toBe(1);

    const noTarget = computeUserBadgeMetrics(
      baseInput({
        proteinTargetGrams: null,
        mealLogs: [{ loggedAt: utcNoon('2026-07-10'), totalProteinGrams: 999 }],
      }),
    );

    expect(noTarget.proteinTargetHitDays).toBe(0);
  });

  it('passes totalChatMessages through unchanged', () => {
    const metrics = computeUserBadgeMetrics(
      baseInput({ totalChatMessages: 42 }),
    );

    expect(metrics.totalChatMessages).toBe(42);
  });
});
