import { badgeDefinitions } from '../ai/rewards/badge-definitions';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRewardsOverviewService } from './admin-rewards-overview.service';

describe('AdminRewardsOverviewService', () => {
  const userBadgeCount = jest.fn();
  const userCount = jest.fn();
  const groupBy = jest.fn();
  const prisma = {
    userBadge: { count: userBadgeCount, groupBy },
    user: { count: userCount },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes averageBadgesPerUser as totalBadgesUnlocked ÷ totalUsers', async () => {
    userBadgeCount.mockResolvedValue(150);
    userCount.mockResolvedValue(50);
    groupBy.mockResolvedValue([]);
    const service = new AdminRewardsOverviewService(prisma);

    const overview = await service.getOverview();

    expect(overview.totalBadgesUnlocked).toBe(150);
    expect(overview.totalUsers).toBe(50);
    expect(overview.averageBadgesPerUser).toBe(3);
  });

  it('returns 0 average rather than dividing by zero when there are no users', async () => {
    userBadgeCount.mockResolvedValue(0);
    userCount.mockResolvedValue(0);
    groupBy.mockResolvedValue([]);
    const service = new AdminRewardsOverviewService(prisma);

    const overview = await service.getOverview();

    expect(overview.averageBadgesPerUser).toBe(0);
  });

  it('ranks the top 10 most-unlocked badges by unlock count, descending', async () => {
    userBadgeCount.mockResolvedValue(0);
    userCount.mockResolvedValue(0);
    // Give the first 12 real badge keys distinct, descending-friendly counts.
    const sample = badgeDefinitions.slice(0, 12);
    groupBy.mockResolvedValue(
      sample.map((badge, index) => ({
        badgeKey: badge.key,
        _count: { badgeKey: sample.length - index },
      })),
    );
    const service = new AdminRewardsOverviewService(prisma);

    const overview = await service.getOverview();

    expect(overview.mostUnlockedBadges).toHaveLength(10);
    expect(overview.mostUnlockedBadges[0].badgeKey).toBe(sample[0].key);
    expect(overview.mostUnlockedBadges[0].unlockCount).toBe(12);
    const counts = overview.mostUnlockedBadges.map((b) => b.unlockCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('includes never-unlocked badges (0 count) in the least-unlocked ranking, not just what groupBy returned', async () => {
    userBadgeCount.mockResolvedValue(5);
    userCount.mockResolvedValue(5);
    // Only one badge has ever been unlocked - everything else is 0.
    groupBy.mockResolvedValue([
      { badgeKey: badgeDefinitions[0].key, _count: { badgeKey: 5 } },
    ]);
    const service = new AdminRewardsOverviewService(prisma);

    const overview = await service.getOverview();

    expect(overview.leastUnlockedBadges).toHaveLength(10);
    expect(overview.leastUnlockedBadges.every((b) => b.unlockCount === 0)).toBe(
      true,
    );
    expect(
      overview.leastUnlockedBadges.some(
        (b) => b.badgeKey === badgeDefinitions[0].key,
      ),
    ).toBe(false);
  });

  it('includes name/category from badge-definitions.ts alongside the unlock count', async () => {
    userBadgeCount.mockResolvedValue(3);
    userCount.mockResolvedValue(1);
    const target = badgeDefinitions[0];
    groupBy.mockResolvedValue([
      { badgeKey: target.key, _count: { badgeKey: 3 } },
    ]);
    const service = new AdminRewardsOverviewService(prisma);

    const overview = await service.getOverview();

    const found = overview.mostUnlockedBadges.find(
      (b) => b.badgeKey === target.key,
    );
    expect(found).toEqual({
      badgeKey: target.key,
      name: target.name,
      category: target.category,
      unlockCount: 3,
    });
  });
});
