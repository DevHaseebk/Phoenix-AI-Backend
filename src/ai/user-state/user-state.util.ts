export type UserState =
  | 'NEW_USER'
  | 'ACTIVE_USER'
  | 'LOW_ACTIVITY'
  | 'HIGH_RISK'
  | 'COMEBACK'
  | 'PLATEAU'
  | 'VACATION'
  | 'MAINTENANCE';

export interface UserStateResult {
  state: UserState;
  reason: string;
}

export interface WeightLogPoint {
  weightKg: number;
  loggedAt: Date;
}

export interface DailyCalorieTotal {
  date: string;
  calories: number;
}

export interface UserStateInput {
  now: Date;
  /** True result from detectSafetyFlags() on the current message - top-priority override. */
  hasMedicalRiskFlag: boolean;
  onboardingCompletedAt: Date | null;
  /** Most recent loggedAt across weight/meal/water/exercise logs, if any. */
  lastActivityAt: Date | null;
  /** Second-most-recent activity date, used to detect a gap-then-return pattern for Comeback. */
  previousActivityAt: Date | null;
  /** Weight logs over the last ~4 weeks, newest first. */
  recentWeightLogs: WeightLogPoint[];
  /** Per local-date total calories consumed, most recent ~5-7 days, newest first. Only dates with at least one meal log are included. */
  recentDailyCalories: DailyCalorieTotal[];
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  bmrKcal: number | null;
  /** Combined count of all logs (any type) since onboarding completed, used for the New User "minimal history" check. */
  totalLogCountSinceOnboarding: number;
}

// All thresholds below are MVP judgment calls (no locked numeric spec exists in the
// docs) - documented here so the founder can tune them without touching logic.
export const userStateThresholds = {
  /** New User: onboarding completed within this many days AND minimal log history. */
  newUserMaxDaysSinceOnboarding: 7,
  newUserMaxTotalLogs: 5,
  /**
   * Grace period: within this many days of completing onboarding, the
   * inactivity-based High Risk check is skipped entirely (a brand-new user
   * with zero logs simply hasn't had time to log anything yet). Does NOT
   * apply to the under-BMR High Risk sub-check - see determineUserState().
   */
  newUserGracePeriodDays: 3,
  /** Comeback: a gap of at least this many days with zero activity, then activity today. */
  comebackMinGapDays: 14,
  comebackMaxDaysSinceLastActivity: 1,
  /** Low Activity: last log this many days ago (inclusive range), not long enough for High Risk. */
  lowActivityMinDaysSinceLastActivity: 3,
  lowActivityMaxDaysSinceLastActivity: 6,
  /** High Risk (inactivity path): last log at least this many days ago. */
  highRiskMinDaysSinceLastActivity: 7,
  /** High Risk (under-eating path): consumed calories below this fraction of BMR... */
  highRiskUnderBmrFraction: 0.7,
  /** ...on at least this many of the most recent qualifying days... */
  highRiskUnderBmrMinDays: 3,
  /** ...within this many most-recent days considered. */
  highRiskUnderBmrWindowDays: 5,
  /** Plateau: weight trend window must span at least this many days... */
  plateauMinWindowDays: 18,
  /** ...with the latest weight log within this many days of "now" (still actively logging)... */
  plateauMaxDaysSinceLastWeightLog: 7,
  /** ...and change within this fraction of body weight counts as "flat". */
  plateauFlatFraction: 0.01,
  /** Active User: last activity within this many days. */
  activeUserMaxDaysSinceLastActivity: 2,
  /** Maintenance (stub): current weight within this fraction of target counts as "at goal". */
  maintenanceToleranceFraction: 0.03,
} as const;

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * Deterministic, non-AI classification of a user's current coaching state.
 * Priority order per 02_Product_Bible.md 17.4 / 01_Decision_Log.md D-067:
 * Medical risk -> Comeback -> High Risk -> Plateau -> Vacation (never
 * auto-triggers - no manual toggle exists yet, future work) -> New User ->
 * Low Activity -> Active User -> Maintenance.
 *
 * Low Activity priority (LOCKED MVP design decision, not an unresolved gap):
 * the docs list Low Activity as one of the 8 states (17.3) but do not specify
 * its priority slot in 17.4. It is deliberately placed here, between New User
 * and Active User, for three reasons:
 *   1. By this point in the chain, Comeback, High Risk, and Plateau have
 *      already been ruled out, so Low Activity only ever applies to a user
 *      who is neither brand-new, nor severely inactive/at-risk, nor
 *      mid-plateau, but still has a mild 3-6 day activity gap.
 *   2. New User is checked first intentionally: a genuinely new user with a
 *      short gap should get New User's encouraging/orientation tone, not a
 *      "you've gone quiet" nudge.
 *   3. Active User is checked last among these because it is effectively the
 *      "nothing else matched" default - it must come after Low Activity, not
 *      before.
 * Do not reorder this without an explicit founder decision.
 *
 * Maintenance is checked only where Active User would otherwise apply (a
 * variant of "on track", just already at goal) - matches D-069's framing of
 * maintenance as what happens after the goal is reached.
 *
 * New User grace period: a user is never classified HIGH_RISK purely for
 * inactivity within newUserGracePeriodDays of completing onboarding - they
 * simply haven't had time to log anything yet. This does NOT suppress the
 * under-BMR HIGH_RISK sub-check; severely low logged intake still overrides
 * the grace period even for a brand-new user.
 */
export function determineUserState(input: UserStateInput): UserStateResult {
  if (input.hasMedicalRiskFlag) {
    return {
      state: 'HIGH_RISK',
      reason: 'Safety flag detected in this message.',
    };
  }

  const daysSinceLastActivity = daysSince(input.lastActivityAt, input.now);
  const daysSincePreviousActivity = daysBetween(
    input.previousActivityAt,
    input.lastActivityAt,
  );
  const daysSinceOnboarding = daysSince(input.onboardingCompletedAt, input.now);
  const isWithinNewUserGracePeriod =
    daysSinceOnboarding !== null &&
    daysSinceOnboarding <= userStateThresholds.newUserGracePeriodDays;

  if (
    daysSinceLastActivity !== null &&
    daysSinceLastActivity <=
      userStateThresholds.comebackMaxDaysSinceLastActivity &&
    daysSincePreviousActivity !== null &&
    daysSincePreviousActivity >= userStateThresholds.comebackMinGapDays
  ) {
    return {
      state: 'COMEBACK',
      reason: `Returned today after a ${daysSincePreviousActivity}-day gap with no logging.`,
    };
  }

  if (
    !isWithinNewUserGracePeriod &&
    (daysSinceLastActivity === null ||
      daysSinceLastActivity >=
        userStateThresholds.highRiskMinDaysSinceLastActivity)
  ) {
    return {
      state: 'HIGH_RISK',
      reason:
        daysSinceLastActivity === null
          ? 'No logging activity found.'
          : `No logging activity for ${daysSinceLastActivity} days.`,
    };
  }

  const underBmrResult = checkUnderBmrPattern(input);
  if (underBmrResult) {
    return underBmrResult;
  }

  const plateauResult = checkPlateau(input);
  if (plateauResult) {
    return plateauResult;
  }

  if (
    input.onboardingCompletedAt !== null &&
    daysSinceOnboarding! <= userStateThresholds.newUserMaxDaysSinceOnboarding &&
    input.totalLogCountSinceOnboarding <=
      userStateThresholds.newUserMaxTotalLogs
  ) {
    return {
      state: 'NEW_USER',
      reason: 'Onboarded recently with little log history yet.',
    };
  }

  if (
    daysSinceLastActivity !== null &&
    daysSinceLastActivity >=
      userStateThresholds.lowActivityMinDaysSinceLastActivity &&
    daysSinceLastActivity <=
      userStateThresholds.lowActivityMaxDaysSinceLastActivity
  ) {
    return {
      state: 'LOW_ACTIVITY',
      reason: `No logging activity for ${daysSinceLastActivity} days.`,
    };
  }

  if (isAtMaintenanceGoal(input)) {
    return {
      state: 'MAINTENANCE',
      reason: 'Current weight is already at the target.',
    };
  }

  return { state: 'ACTIVE_USER', reason: 'Recent logging activity, on track.' };
}

function checkUnderBmrPattern(input: UserStateInput): UserStateResult | null {
  if (input.bmrKcal === null) {
    return null;
  }

  const window = input.recentDailyCalories.slice(
    0,
    userStateThresholds.highRiskUnderBmrWindowDays,
  );
  const threshold =
    input.bmrKcal * userStateThresholds.highRiskUnderBmrFraction;
  const underBmrDays = window.filter((day) => day.calories < threshold);

  if (underBmrDays.length >= userStateThresholds.highRiskUnderBmrMinDays) {
    return {
      state: 'HIGH_RISK',
      reason: `Logged calories were under ${Math.round(threshold)} kcal (below ${Math.round(userStateThresholds.highRiskUnderBmrFraction * 100)}% of BMR) on ${underBmrDays.length} of the last ${window.length} logged days.`,
    };
  }

  return null;
}

function checkPlateau(input: UserStateInput): UserStateResult | null {
  const logs = input.recentWeightLogs;

  if (logs.length < 2) {
    return null;
  }

  const latest = logs[0];
  const daysSinceLatest = daysSince(latest.loggedAt, input.now)!;

  if (daysSinceLatest > userStateThresholds.plateauMaxDaysSinceLastWeightLog) {
    return null;
  }

  const earliestInWindow = logs.reduce((oldest, log) =>
    log.loggedAt < oldest.loggedAt ? log : oldest,
  );
  const windowDays = daysBetween(earliestInWindow.loggedAt, latest.loggedAt);

  if (
    windowDays === null ||
    windowDays < userStateThresholds.plateauMinWindowDays
  ) {
    return null;
  }

  const change = Math.abs(latest.weightKg - earliestInWindow.weightKg);
  const flatBound = latest.weightKg * userStateThresholds.plateauFlatFraction;

  if (change <= flatBound) {
    return {
      state: 'PLATEAU',
      reason: `Weight changed by only ${change.toFixed(2)}kg over ${windowDays} days (within ${(userStateThresholds.plateauFlatFraction * 100).toFixed(0)}% of body weight).`,
    };
  }

  return null;
}

function isAtMaintenanceGoal(input: UserStateInput): boolean {
  if (input.currentWeightKg === null || input.targetWeightKg === null) {
    return false;
  }

  const diff = Math.abs(input.currentWeightKg - input.targetWeightKg);
  const bound =
    input.targetWeightKg * userStateThresholds.maintenanceToleranceFraction;

  return diff <= bound;
}

function daysSince(date: Date | null, now: Date): number | null {
  if (date === null) {
    return null;
  }

  return Math.floor((now.getTime() - date.getTime()) / millisecondsPerDay);
}

function daysBetween(earlier: Date | null, later: Date | null): number | null {
  if (earlier === null || later === null) {
    return null;
  }

  return Math.floor((later.getTime() - earlier.getTime()) / millisecondsPerDay);
}
