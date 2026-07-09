import type { UserState } from '../user-state/user-state.util';

export type NudgeType =
  | 'WEIGHT_UPDATE_DUE'
  | 'MEAL_LOGGING_GAP'
  | 'WATER_TARGET_CLOSE'
  | 'COMEBACK_WELCOME';

export type NudgeNotificationStatus = 'UNREAD' | 'READ' | 'DISMISSED';

// All thresholds below are MVP judgment calls (no locked numeric spec exists
// in the docs) - documented here so the founder can tune them without
// touching logic, matching the pattern already used in user-state.util.ts.
export const nudgeThresholds = {
  /** WEIGHT_UPDATE_DUE fires when the last weight log is at least this many days old (or none exists). */
  weightGapDays: 5,
  /** MEAL_LOGGING_GAP fires only after this local hour if nothing has been logged today (24h, "past early afternoon"). */
  mealGapReferenceHour: 14,
  /** WATER_TARGET_CLOSE fires when remaining water is > 0 and at most this many ml. */
  waterCloseRemainingMlMax: 750,
  /** Maximum proactive app notifications generated per user per day (D-064). */
  dailyNudgeCap: 3,
  /**
   * Notification-fatigue suppression (D-065): if the last N notifications of
   * a given type were all left unread/dismissed (none marked READ), that
   * type is suppressed until the user reads one, breaking the streak.
   */
  fatigueLookbackCount: 3,
} as const;

/**
 * Priority order for trimming to the daily cap (highest priority first).
 * Comeback first: a returning user's welcome-back moment matters most
 * emotionally (D-068's human-first principle extends here) and is rare, so
 * it should never be crowded out. Weight next: a foundational, infrequent
 * metric - more meaningful when actually due. Meal next: daily and
 * actionable, but already surfaced via the dashboard's own quick actions.
 * Water last: the softest, least consequential nudge of the four.
 */
export const nudgePriorityOrder: NudgeType[] = [
  'COMEBACK_WELCOME',
  'WEIGHT_UPDATE_DUE',
  'MEAL_LOGGING_GAP',
  'WATER_TARGET_CLOSE',
];

export interface NudgeRuleInput {
  userState: UserState;
  /** Days since the most recent weight log, or null if none exists. */
  daysSinceLastWeightLog: number | null;
  hasMealLoggedToday: boolean;
  /** Current local hour (0-23) in the user's timezone. */
  currentLocalHour: number;
  /** Remaining water toward today's target, in ml (0 if already met/exceeded). */
  waterRemainingMl: number;
}

/**
 * Deterministic, non-AI rule evaluation. Smart Silence (D-063) is satisfied
 * structurally: these are the only rules that ever produce a candidate -
 * there is no default/filler "everything's fine" nudge for an on-track
 * Active/Maintenance user, so a user with no genuinely actionable gap
 * correctly receives zero candidates regardless of their state.
 */
export function evaluateNudgeRules(input: NudgeRuleInput): NudgeType[] {
  const candidates: NudgeType[] = [];

  if (input.userState === 'COMEBACK') {
    candidates.push('COMEBACK_WELCOME');
  }

  if (
    input.daysSinceLastWeightLog === null ||
    input.daysSinceLastWeightLog >= nudgeThresholds.weightGapDays
  ) {
    candidates.push('WEIGHT_UPDATE_DUE');
  }

  if (
    !input.hasMealLoggedToday &&
    input.currentLocalHour >= nudgeThresholds.mealGapReferenceHour
  ) {
    candidates.push('MEAL_LOGGING_GAP');
  }

  if (
    input.waterRemainingMl > 0 &&
    input.waterRemainingMl <= nudgeThresholds.waterCloseRemainingMlMax
  ) {
    candidates.push('WATER_TARGET_CLOSE');
  }

  return candidates;
}

/**
 * Suppresses a nudge type if the last `fatigueLookbackCount` notifications of
 * that type were all left ignored (not marked READ). Re-engagement (marking
 * any one of them READ) breaks the streak and un-suppresses the type.
 */
export function applyFatigueSuppression(
  candidateTypes: NudgeType[],
  recentStatusesByType: Partial<Record<NudgeType, NudgeNotificationStatus[]>>,
): NudgeType[] {
  return candidateTypes.filter((type) => {
    const recent = recentStatusesByType[type] ?? [];

    if (recent.length < nudgeThresholds.fatigueLookbackCount) {
      return true;
    }

    const lastN = recent.slice(0, nudgeThresholds.fatigueLookbackCount);
    const allIgnored = lastN.every((status) => status !== 'READ');

    return !allIgnored;
  });
}

/**
 * Trims candidates to whatever's left of the daily cap, keeping the
 * highest-priority types first (per nudgePriorityOrder).
 */
export function applyDailyCap(
  candidateTypes: NudgeType[],
  alreadyCreatedToday: number,
): NudgeType[] {
  const remainingSlots = Math.max(
    0,
    nudgeThresholds.dailyNudgeCap - alreadyCreatedToday,
  );
  const sorted = [...candidateTypes].sort(
    (a, b) => nudgePriorityOrder.indexOf(a) - nudgePriorityOrder.indexOf(b),
  );

  return sorted.slice(0, remainingSlots);
}
