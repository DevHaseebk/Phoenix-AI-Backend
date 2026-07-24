import { Injectable } from '@nestjs/common';
import { badgeDefinitions } from '../ai/rewards/badge-definitions';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminRewardsBadgeRank {
  badgeKey: string;
  name: string;
  category: string;
  unlockCount: number;
}

export interface AdminRewardsOverview {
  totalBadgesUnlocked: number;
  totalUsers: number;
  /** totalBadgesUnlocked ÷ totalUsers, across ALL users (not just users who
   * have unlocked at least one) - the most intuitive read of "on average,
   * how many badges does a user have". 0 when totalUsers is 0. */
  averageBadgesPerUser: number;
  /** Top 10 by unlock count, descending. */
  mostUnlockedBadges: AdminRewardsBadgeRank[];
  /** Bottom 10 by unlock count, ascending (0-unlock badges sort first) -
   * candidates for being too hard or miscalibrated per the task's own
   * framing. Every badge in badge-definitions.ts is included even with zero
   * unlocks (a plain groupBy would silently omit never-unlocked badges). */
  leastUnlockedBadges: AdminRewardsBadgeRank[];
}

const RANK_LIST_SIZE = 10;

/**
 * Read-only rewards/badge engagement analytics for the admin panel. Badge
 * definitions are static config (badge-definitions.ts, never written to the
 * DB - see that file's own doc comment), so "which badges exist" always
 * comes from there; only unlock counts come from the UserBadge table.
 */
@Injectable()
export class AdminRewardsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminRewardsOverview> {
    const [totalBadgesUnlocked, totalUsers, grouped] = await Promise.all([
      this.prisma.userBadge.count(),
      this.prisma.user.count(),
      this.prisma.userBadge.groupBy({
        by: ['badgeKey'],
        _count: { badgeKey: true },
      }),
    ]);

    const unlockCountByKey = new Map(
      grouped.map((row) => [row.badgeKey, row._count.badgeKey]),
    );

    const ranked: AdminRewardsBadgeRank[] = badgeDefinitions.map((badge) => ({
      badgeKey: badge.key,
      name: badge.name,
      category: badge.category,
      unlockCount: unlockCountByKey.get(badge.key) ?? 0,
    }));

    const mostUnlockedBadges = [...ranked]
      .sort((a, b) => b.unlockCount - a.unlockCount)
      .slice(0, RANK_LIST_SIZE);
    const leastUnlockedBadges = [...ranked]
      .sort((a, b) => a.unlockCount - b.unlockCount)
      .slice(0, RANK_LIST_SIZE);

    return {
      totalBadgesUnlocked,
      totalUsers,
      averageBadgesPerUser:
        totalUsers === 0 ? 0 : totalBadgesUnlocked / totalUsers,
      mostUnlockedBadges,
      leastUnlockedBadges,
    };
  }
}
