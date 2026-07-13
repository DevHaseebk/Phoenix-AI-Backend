/**
 * Static, typed badge config - see docs/17_Rewards_Badge_Design.md for the
 * full design (9 categories) and docs/02_Product_Bible.md §22 for the
 * philosophy (celebrate effort/consistency/comeback, not just scale movement;
 * streaks never punish). Badges are data, not code: one generic evaluation
 * engine (rewards-engine.util.ts) compares each entry's `threshold` against
 * the matching `metric` from computeUserBadgeMetrics() - adding a badge later
 * is a config edit, not a new function. Persisted unlock state lives in the
 * UserBadge table; this file is never written to the DB.
 *
 * Deliberately built as the FULL design-doc set (not the doc's own suggested
 * "MVP subset") per this task's explicit scope: "covering all 9 categories".
 *
 * Weight Loss Milestones note: the design doc's "Quarter Way (proportional to
 * their own goal)" idea is NOT represented here - a static config can only
 * hold fixed absolute-kg thresholds, not a per-user-relative one. That
 * per-user proportional breakdown is exactly what the separate dynamic
 * GET /rewards/milestones endpoint (Goal Engine, Product Bible §21.2) is for;
 * this file only has the fixed-kg tiered badges plus a single "Goal Achieved"
 * badge.
 */

export type BadgeCategory =
  | 'LOGGING_COUNT'
  | 'TOTAL_ACTIVE_DAYS'
  | 'CURRENT_STREAK'
  | 'WEIGHT_LOSS_MILESTONES'
  | 'ACTIVITY_VOLUME'
  | 'COMBO_FULL_DAY'
  | 'COMEBACK_RESILIENCE'
  | 'ENGAGEMENT'
  | 'NUTRITION_HABIT';

/** Keys into UserBadgeMetrics (rewards-metrics.util.ts) - every badge is unlocked by comparing one metric against its threshold. */
export type BadgeMetricKey =
  | 'mealLogCount'
  | 'waterLogCount'
  | 'exerciseLogCount'
  | 'weightLogCount'
  | 'totalActiveDays'
  | 'currentStreakDays'
  | 'weightLossKg'
  | 'goalAchieved'
  | 'totalExerciseMinutes'
  | 'totalDistanceKm'
  | 'fullDayComboCount'
  | 'tripleThreatCount'
  | 'perfectWeekCount'
  | 'comebackCount'
  | 'totalChatMessages'
  | 'proteinTargetHitDays'
  | 'waterTargetHitDays';

export interface BadgeDefinition {
  key: string;
  category: BadgeCategory;
  /** 1-based position within its category/subgroup, for display ordering. */
  tier: number;
  threshold: number;
  metric: BadgeMetricKey;
  name: string;
  description: string;
}

const generalTierNames: Record<number, string> = {
  3: 'First Steps',
  10: 'Building Habits',
  25: 'Quarter Century',
  50: 'Halfway Hero',
  100: 'Century Club',
  250: 'Elite 250',
  500: 'Legend 500',
};

function loggingCountBadges(
  typeKey: string,
  typeLabel: string,
  metric: BadgeMetricKey,
  thresholds: number[],
): BadgeDefinition[] {
  return thresholds.map((threshold, index) => ({
    key: `LOGGING_${typeKey}_${threshold}`,
    category: 'LOGGING_COUNT',
    tier: index + 1,
    threshold,
    metric,
    name: `${generalTierNames[threshold]}: ${typeLabel}`,
    description: `Logged ${typeLabel.toLowerCase()} ${threshold} times.`,
  }));
}

const loggingCountBadgeList: BadgeDefinition[] = [
  ...loggingCountBadges(
    'MEAL',
    'Meal Logging',
    'mealLogCount',
    [3, 10, 25, 50, 100, 250, 500],
  ),
  ...loggingCountBadges(
    'WATER',
    'Water Logging',
    'waterLogCount',
    [3, 10, 25, 50, 100, 250, 500],
  ),
  ...loggingCountBadges(
    'EXERCISE',
    'Exercise Logging',
    'exerciseLogCount',
    [3, 10, 25, 50, 100, 250],
  ),
  ...loggingCountBadges(
    'WEIGHT',
    'Weight Logging',
    'weightLogCount',
    [3, 10, 25, 50, 100],
  ),
];

const totalActiveDaysNames: Record<number, string> = {
  7: 'One Week In',
  14: 'Two Weeks Strong',
  30: 'One Month Strong',
  60: 'Two Month Momentum',
  100: 'Century of Days',
  180: 'Half-Year Warrior',
  365: 'Full Year Journey',
};

const totalActiveDaysBadgeList: BadgeDefinition[] = [
  7, 14, 30, 60, 100, 180, 365,
].map((threshold, index) => ({
  key: `ACTIVE_DAYS_${threshold}`,
  category: 'TOTAL_ACTIVE_DAYS',
  tier: index + 1,
  threshold,
  metric: 'totalActiveDays',
  name: totalActiveDaysNames[threshold],
  description: `Logged something on ${threshold} different days.`,
}));

const currentStreakNames: Record<number, string> = {
  3: '3-Day Streak',
  7: 'One Week Streak',
  14: 'Two Week Streak',
  30: 'One Month Streak',
  60: 'Two Month Streak',
  100: '100-Day Streak',
};

const currentStreakBadgeList: BadgeDefinition[] = [3, 7, 14, 30, 60, 100].map(
  (threshold, index) => ({
    key: `STREAK_${threshold}`,
    category: 'CURRENT_STREAK',
    tier: index + 1,
    threshold,
    metric: 'currentStreakDays',
    // No-shame framing: the badge celebrates the streak reached, never a reset.
    name: currentStreakNames[threshold],
    description: `Logged something ${threshold} days in a row.`,
  }),
);

const weightLossKgNames: Record<number, string> = {
  1: 'Light Start',
  3: 'Momentum Building',
  5: 'Five Down',
  10: 'Double Digits',
  15: '15kg Milestone',
  20: '20kg Strong',
  30: '30kg Transformation',
  50: '50kg Triumph',
};

const weightLossBadgeList: BadgeDefinition[] = [
  ...[1, 3, 5, 10, 15, 20, 30, 50].map((threshold, index) => ({
    key: `WEIGHT_LOSS_${threshold}KG`,
    category: 'WEIGHT_LOSS_MILESTONES' as const,
    tier: index + 1,
    threshold,
    metric: 'weightLossKg' as const,
    name: weightLossKgNames[threshold],
    description: `Lost ${threshold}kg from your starting weight.`,
  })),
  {
    key: 'WEIGHT_LOSS_GOAL_ACHIEVED',
    category: 'WEIGHT_LOSS_MILESTONES',
    tier: 9,
    threshold: 1,
    metric: 'goalAchieved',
    name: 'Goal Achieved',
    description: 'Reached your target weight.',
  },
];

const activityMinutesNames: Record<number, string> = {
  60: 'Moving More',
  300: 'Five-Hour Mover',
  600: 'Ten-Hour Athlete',
  1500: 'Twenty-Five-Hour Warrior',
  3000: 'Fifty-Hour Legend',
};

const activityDistanceNames: Record<number, string> = {
  5: '5K Wanderer',
  20: '20K Explorer',
  50: '50K Trailblazer',
  100: '100K Voyager',
  500: '500K Odyssey',
};

const activityVolumeBadgeList: BadgeDefinition[] = [
  ...[60, 300, 600, 1500, 3000].map((threshold, index) => ({
    key: `ACTIVITY_MINUTES_${threshold}`,
    category: 'ACTIVITY_VOLUME' as const,
    tier: index + 1,
    threshold,
    metric: 'totalExerciseMinutes' as const,
    name: activityMinutesNames[threshold],
    description: `Logged ${threshold} total exercise minutes.`,
  })),
  ...[5, 20, 50, 100, 500].map((threshold, index) => ({
    key: `ACTIVITY_DISTANCE_${threshold}KM`,
    category: 'ACTIVITY_VOLUME' as const,
    tier: index + 6,
    threshold,
    metric: 'totalDistanceKm' as const,
    name: activityDistanceNames[threshold],
    description: `Logged ${threshold}km of total distance.`,
  })),
];

const comboBadgeList: BadgeDefinition[] = [
  {
    key: 'COMBO_FULL_DAY',
    category: 'COMBO_FULL_DAY',
    tier: 1,
    threshold: 1,
    metric: 'fullDayComboCount',
    name: 'Full Day',
    description: 'Logged meal, water, exercise, and weight all in one day.',
  },
  {
    key: 'COMBO_TRIPLE_THREAT',
    category: 'COMBO_FULL_DAY',
    tier: 2,
    threshold: 1,
    metric: 'tripleThreatCount',
    name: 'Triple Threat',
    description: 'Logged 3 of the 4 log types in one day.',
  },
  {
    key: 'COMBO_PERFECT_WEEK',
    category: 'COMBO_FULL_DAY',
    tier: 3,
    threshold: 1,
    metric: 'perfectWeekCount',
    name: 'Perfect Week',
    description: 'Logged meals and water every day for a full week.',
  },
];

const comebackBadgeList: BadgeDefinition[] = [
  {
    key: 'COMEBACK_WELCOME_BACK',
    category: 'COMEBACK_RESILIENCE',
    tier: 1,
    threshold: 1,
    metric: 'comebackCount',
    name: 'Welcome Back',
    description: 'Returned and started logging again after time away.',
  },
  {
    key: 'COMEBACK_NEVER_GIVE_UP',
    category: 'COMEBACK_RESILIENCE',
    tier: 2,
    threshold: 2,
    metric: 'comebackCount',
    name: 'Never Give Up',
    description:
      'Came back and kept going more than once - that is resilience, not failure.',
  },
];

const engagementBadgeList: BadgeDefinition[] = [
  {
    key: 'ENGAGEMENT_FIRST_CHAT',
    category: 'ENGAGEMENT',
    tier: 1,
    threshold: 1,
    metric: 'totalChatMessages',
    name: 'First Chat',
    description: 'Started your first conversation with the AI Coach.',
  },
  {
    key: 'ENGAGEMENT_CURIOUS_MIND_10',
    category: 'ENGAGEMENT',
    tier: 2,
    threshold: 10,
    metric: 'totalChatMessages',
    name: 'Curious Mind',
    description: 'Sent 10 messages to the AI Coach.',
  },
  {
    key: 'ENGAGEMENT_CURIOUS_MIND_50',
    category: 'ENGAGEMENT',
    tier: 3,
    threshold: 50,
    metric: 'totalChatMessages',
    name: 'Deeper Conversations',
    description: 'Sent 50 messages to the AI Coach.',
  },
  {
    key: 'ENGAGEMENT_CURIOUS_MIND_100',
    category: 'ENGAGEMENT',
    tier: 4,
    threshold: 100,
    metric: 'totalChatMessages',
    name: "Coach's Best Friend",
    description: 'Sent 100 messages to the AI Coach.',
  },
];

const nutritionHabitBadgeList: BadgeDefinition[] = [
  {
    key: 'NUTRITION_PROTEIN_PRO_7',
    category: 'NUTRITION_HABIT',
    tier: 1,
    threshold: 7,
    metric: 'proteinTargetHitDays',
    name: 'Protein Pro',
    description: 'Hit your protein target on 7 days.',
  },
  {
    key: 'NUTRITION_PROTEIN_PRO_30',
    category: 'NUTRITION_HABIT',
    tier: 2,
    threshold: 30,
    metric: 'proteinTargetHitDays',
    name: 'Protein Pro: Elite',
    description: 'Hit your protein target on 30 days.',
  },
  {
    key: 'NUTRITION_HYDRATION_HERO_7',
    category: 'NUTRITION_HABIT',
    tier: 3,
    threshold: 7,
    metric: 'waterTargetHitDays',
    name: 'Hydration Hero',
    description: 'Hit your water target on 7 days.',
  },
  {
    key: 'NUTRITION_HYDRATION_HERO_30',
    category: 'NUTRITION_HABIT',
    tier: 4,
    threshold: 30,
    metric: 'waterTargetHitDays',
    name: 'Hydration Hero: Elite',
    description: 'Hit your water target on 30 days.',
  },
];

export const badgeDefinitions: BadgeDefinition[] = [
  ...loggingCountBadgeList,
  ...totalActiveDaysBadgeList,
  ...currentStreakBadgeList,
  ...weightLossBadgeList,
  ...activityVolumeBadgeList,
  ...comboBadgeList,
  ...comebackBadgeList,
  ...engagementBadgeList,
  ...nutritionHabitBadgeList,
];

export const badgeDefinitionsByKey: ReadonlyMap<string, BadgeDefinition> =
  new Map(badgeDefinitions.map((badge) => [badge.key, badge]));
