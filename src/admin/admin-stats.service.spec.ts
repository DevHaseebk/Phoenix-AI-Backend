import { SubscriptionStatus, UnknownFoodQueueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminStatsService } from './admin-stats.service';

describe('AdminStatsService', () => {
  const userCount = jest.fn();
  const subscriptionCount = jest.fn();
  const unknownFoodQueueItemCount = jest.fn();
  const prisma = {
    user: { count: userCount },
    subscription: { count: subscriptionCount },
    unknownFoodQueueItem: { count: unknownFoodQueueItemCount },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the five expected count queries and assembles the result', async () => {
    userCount.mockResolvedValueOnce(120); // total
    subscriptionCount.mockResolvedValueOnce(30); // trialing
    subscriptionCount.mockResolvedValueOnce(45); // active
    userCount.mockResolvedValueOnce(6); // signups last 7 days
    unknownFoodQueueItemCount.mockResolvedValueOnce(9); // pending unknown foods

    const service = new AdminStatsService(prisma);
    const now = new Date('2026-07-16T00:00:00.000Z');
    const stats = await service.getStats(now);

    expect(stats).toEqual({
      totalUsers: 120,
      trialingUsers: 30,
      activeUsers: 45,
      signupsLast7Days: 6,
      pendingUnknownFoods: 9,
    });

    expect(subscriptionCount).toHaveBeenNthCalledWith(1, {
      where: { status: SubscriptionStatus.TRIALING },
    });
    expect(subscriptionCount).toHaveBeenNthCalledWith(2, {
      where: { status: SubscriptionStatus.ACTIVE },
    });
    expect(unknownFoodQueueItemCount).toHaveBeenCalledWith({
      where: { status: UnknownFoodQueueStatus.PENDING },
    });

    const signupCountCalls = userCount.mock.calls as Array<
      [{ where: { createdAt: { gte: Date } } }]
    >;
    expect(signupCountCalls[1][0].where.createdAt.gte.toISOString()).toBe(
      '2026-07-09T00:00:00.000Z',
    );
  });
});
