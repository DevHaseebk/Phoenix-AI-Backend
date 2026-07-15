/** Trial length applied at signup (both email/password and Google). */
export const trialPeriodDays = 7;

/** AI Coach messages/generations allowed per local day while TRIALING. */
export const trialDailyAiActionLimit = 3;

export type SubscriptionAccessLevel =
  'FULL_UNLIMITED' | 'TRIAL_LIMITED' | 'LOCKED';

export type AiCoachFeature =
  'CHAT' | 'MEAL_ESTIMATE' | 'MEAL_PLAN' | 'WEEKLY_REVIEW';

export type AiGateBlockedReason = 'LOCKED' | 'TRIAL_LIMIT_REACHED';

export interface AiGateResult {
  allowed: boolean;
  level: SubscriptionAccessLevel;
  reason?: AiGateBlockedReason;
  message?: string;
  trialMessagesUsedToday?: number;
  trialMessagesLimit?: number;
}

export const lockedMessage =
  "Your free trial has ended and you don't have an active DailyFit Pro subscription yet. Upgrade to keep chatting with your AI Coach, planning meals, and generating weekly reviews - your logs, memories, and rewards are all still here.";

export const trialLimitReachedMessage =
  `You've used all ${trialDailyAiActionLimit} of your free AI Coach messages for today. ` +
  'Upgrade to DailyFit Pro for unlimited AI coaching, or come back tomorrow for 3 more.';
