import { badgeDefinitions } from './badge-definitions';
import {
  buildLockedBadgeProgress,
  evaluateNewlyUnlockedBadges,
} from './rewards-engine.util';
import type { UserBadgeMetrics } from './rewards-metrics.util';

function zeroMetrics(
  overrides: Partial<UserBadgeMetrics> = {},
): UserBadgeMetrics {
  return {
    mealLogCount: 0,
    waterLogCount: 0,
    exerciseLogCount: 0,
    weightLogCount: 0,
    totalActiveDays: 0,
    currentStreakDays: 0,
    weightLossKg: 0,
    goalAchieved: 0,
    totalExerciseMinutes: 0,
    totalDistanceKm: 0,
    fullDayComboCount: 0,
    tripleThreatCount: 0,
    perfectWeekCount: 0,
    comebackCount: 0,
    totalChatMessages: 0,
    proteinTargetHitDays: 0,
    waterTargetHitDays: 0,
    ...overrides,
  };
}

describe('badge-definitions config', () => {
  it('has no duplicate keys', () => {
    const keys = badgeDefinitions.map((badge) => badge.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers all 9 categories from the design doc', () => {
    const categories = new Set(badgeDefinitions.map((badge) => badge.category));

    expect(categories).toEqual(
      new Set([
        'LOGGING_COUNT',
        'TOTAL_ACTIVE_DAYS',
        'CURRENT_STREAK',
        'WEIGHT_LOSS_MILESTONES',
        'ACTIVITY_VOLUME',
        'COMBO_FULL_DAY',
        'COMEBACK_RESILIENCE',
        'ENGAGEMENT',
        'NUTRITION_HABIT',
      ]),
    );
  });
});

describe('evaluateNewlyUnlockedBadges', () => {
  it('returns badges whose metric meets threshold and are not already unlocked', () => {
    const metrics = zeroMetrics({ mealLogCount: 10, totalChatMessages: 1 });

    const newlyUnlocked = evaluateNewlyUnlockedBadges(metrics, new Set());
    const keys = newlyUnlocked.map((badge) => badge.key);

    expect(keys).toContain('LOGGING_MEAL_3');
    expect(keys).toContain('LOGGING_MEAL_10');
    expect(keys).not.toContain('LOGGING_MEAL_25');
    expect(keys).toContain('ENGAGEMENT_FIRST_CHAT');
  });

  it('excludes badges already recorded as unlocked, even if the metric still qualifies', () => {
    const metrics = zeroMetrics({ mealLogCount: 10 });

    const newlyUnlocked = evaluateNewlyUnlockedBadges(
      metrics,
      new Set(['LOGGING_MEAL_3']),
    );
    const keys = newlyUnlocked.map((badge) => badge.key);

    expect(keys).not.toContain('LOGGING_MEAL_3');
    expect(keys).toContain('LOGGING_MEAL_10');
  });

  it('is idempotent: re-evaluating with the same metrics and now-unlocked keys unlocks nothing new', () => {
    const metrics = zeroMetrics({ mealLogCount: 10 });
    const firstPass = evaluateNewlyUnlockedBadges(metrics, new Set());
    const afterUnlocking = new Set(firstPass.map((badge) => badge.key));

    const secondPass = evaluateNewlyUnlockedBadges(metrics, afterUnlocking);

    expect(secondPass).toHaveLength(0);
  });

  it('returns an empty array when no metric meets any threshold', () => {
    expect(evaluateNewlyUnlockedBadges(zeroMetrics(), new Set())).toHaveLength(
      0,
    );
  });
});

describe('buildLockedBadgeProgress', () => {
  it('reports progress capped at the threshold and excludes unlocked badges', () => {
    const metrics = zeroMetrics({ mealLogCount: 7 });

    const locked = buildLockedBadgeProgress(
      metrics,
      new Set(['LOGGING_MEAL_3']),
    );
    const mealTenBadge = locked.find(
      (badge) => badge.key === 'LOGGING_MEAL_10',
    );

    expect(
      locked.find((badge) => badge.key === 'LOGGING_MEAL_3'),
    ).toBeUndefined();
    expect(mealTenBadge?.progressLabel).toBe('7/10');
    expect(mealTenBadge?.progressPercentage).toBe(70);
  });

  it('never reports progress above 100%', () => {
    const metrics = zeroMetrics({ mealLogCount: 999 });

    const locked = buildLockedBadgeProgress(metrics, new Set());
    const mealTenBadge = locked.find(
      (badge) => badge.key === 'LOGGING_MEAL_10',
    );

    // mealLogCount(999) already qualifies LOGGING_MEAL_10, so it would appear
    // in the "unlocked" set in real usage - here we only check the raw
    // capping behavior in isolation.
    expect(mealTenBadge?.currentValue).toBe(10);
    expect(mealTenBadge?.progressPercentage).toBe(100);
  });
});
