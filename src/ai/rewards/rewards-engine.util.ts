import { badgeDefinitions, type BadgeDefinition } from './badge-definitions';
import type { UserBadgeMetrics } from './rewards-metrics.util';

export interface LockedBadgeProgress extends BadgeDefinition {
  currentValue: number;
  /** e.g. "7/10" - matches the shape 10_API_Contracts.md §21.1 calls for. */
  progressLabel: string;
  progressPercentage: number;
}

/**
 * Generic evaluation: every badge in badge-definitions.ts is just a
 * (metric, threshold) pair, so unlocking is a single comparison, not
 * per-badge logic. Returns only badges that newly qualify (metric meets
 * threshold) and are not already in `alreadyUnlockedKeys` - callers persist
 * these as new UserBadge rows and fire one notification per badge. Calling
 * this repeatedly with the same metrics/already-unlocked set is idempotent
 * (returns the same newly-qualifying set each time), so re-running never
 * produces duplicate unlocks as long as the caller checks against what's
 * already persisted.
 */
export function evaluateNewlyUnlockedBadges(
  metrics: UserBadgeMetrics,
  alreadyUnlockedKeys: ReadonlySet<string>,
): BadgeDefinition[] {
  return badgeDefinitions.filter(
    (badge) =>
      !alreadyUnlockedKeys.has(badge.key) &&
      metrics[badge.metric] >= badge.threshold,
  );
}

/**
 * All badges the user has not yet unlocked, with progress toward each one's
 * threshold - used to render the "locked" section of GET /rewards.
 */
export function buildLockedBadgeProgress(
  metrics: UserBadgeMetrics,
  unlockedKeys: ReadonlySet<string>,
): LockedBadgeProgress[] {
  return badgeDefinitions
    .filter((badge) => !unlockedKeys.has(badge.key))
    .map((badge) => {
      const currentValue = Math.min(metrics[badge.metric], badge.threshold);

      return {
        ...badge,
        currentValue,
        progressLabel: `${currentValue}/${badge.threshold}`,
        progressPercentage: Math.round((currentValue / badge.threshold) * 100),
      };
    });
}
