import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBillingOverviewService } from './admin-billing-overview.service';

describe('AdminBillingOverviewService', () => {
  const subscriptionCount = jest.fn();
  const userCount = jest.fn();
  const prisma = {
    subscription: { count: subscriptionCount },
    user: { count: userCount },
  } as unknown as PrismaService;
  const configGet = jest.fn();
  const config = { get: configGet } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function queueCounts(values: {
    totalActiveSubscriptions: number;
    trialsCurrentlyActive: number;
    totalEverTrialed: number;
    totalConverted: number;
    canceledOrExpiredCount: number;
    signedUp: number;
    enteredTrial: number;
    convertedLast30Days: number;
  }) {
    subscriptionCount
      .mockResolvedValueOnce(values.totalActiveSubscriptions)
      .mockResolvedValueOnce(values.trialsCurrentlyActive)
      .mockResolvedValueOnce(values.totalEverTrialed)
      .mockResolvedValueOnce(values.totalConverted)
      .mockResolvedValueOnce(values.canceledOrExpiredCount);
    userCount.mockResolvedValueOnce(values.signedUp);
    subscriptionCount
      .mockResolvedValueOnce(values.enteredTrial)
      .mockResolvedValueOnce(values.convertedLast30Days);
  }

  it('computes MRR as active subscriptions × $10/month', async () => {
    queueCounts({
      totalActiveSubscriptions: 45,
      trialsCurrentlyActive: 30,
      totalEverTrialed: 120,
      totalConverted: 50,
      canceledOrExpiredCount: 12,
      signedUp: 10,
      enteredTrial: 10,
      convertedLast30Days: 3,
    });
    configGet.mockReturnValue('sk_test_abc123');
    const service = new AdminBillingOverviewService(prisma, config);

    const overview = await service.getOverview(
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(overview.totalActiveSubscriptions).toBe(45);
    expect(overview.mrrPerSubscriptionUsd).toBe(10);
    expect(overview.mrrUsd).toBe(450);
  });

  it('computes the trial-to-paid conversion rate as totalConverted ÷ totalEverTrialed', async () => {
    queueCounts({
      totalActiveSubscriptions: 45,
      trialsCurrentlyActive: 30,
      totalEverTrialed: 120,
      totalConverted: 50,
      canceledOrExpiredCount: 12,
      signedUp: 10,
      enteredTrial: 10,
      convertedLast30Days: 3,
    });
    configGet.mockReturnValue('sk_test_abc123');
    const service = new AdminBillingOverviewService(prisma, config);

    const overview = await service.getOverview();

    expect(overview.totalEverTrialed).toBe(120);
    expect(overview.totalConverted).toBe(50);
    expect(overview.trialToPaidConversionRate).toBeCloseTo(50 / 120);
  });

  it('returns 0 conversion rate rather than dividing by zero when no one has ever trialed', async () => {
    queueCounts({
      totalActiveSubscriptions: 0,
      trialsCurrentlyActive: 0,
      totalEverTrialed: 0,
      totalConverted: 0,
      canceledOrExpiredCount: 0,
      signedUp: 0,
      enteredTrial: 0,
      convertedLast30Days: 0,
    });
    configGet.mockReturnValue('sk_test_abc123');
    const service = new AdminBillingOverviewService(prisma, config);

    const overview = await service.getOverview();

    expect(overview.trialToPaidConversionRate).toBe(0);
  });

  it('builds the last-30-days signup/trial/converted funnel', async () => {
    queueCounts({
      totalActiveSubscriptions: 45,
      trialsCurrentlyActive: 30,
      totalEverTrialed: 120,
      totalConverted: 50,
      canceledOrExpiredCount: 12,
      signedUp: 18,
      enteredTrial: 18,
      convertedLast30Days: 4,
    });
    configGet.mockReturnValue('sk_test_abc123');
    const service = new AdminBillingOverviewService(prisma, config);

    const overview = await service.getOverview(
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(overview.funnelLast30Days).toEqual({
      signedUp: 18,
      enteredTrial: 18,
      converted: 4,
    });

    const userCountCalls = userCount.mock.calls as Array<
      [{ where: { createdAt: { gte: Date } } }]
    >;
    expect(userCountCalls[0][0].where.createdAt.gte.toISOString()).toBe(
      '2026-06-21T00:00:00.000Z',
    );
  });

  it('flags trialsCurrentlyActive as status TRIALING with a still-future trialEndsAt', async () => {
    queueCounts({
      totalActiveSubscriptions: 0,
      trialsCurrentlyActive: 7,
      totalEverTrialed: 10,
      totalConverted: 2,
      canceledOrExpiredCount: 1,
      signedUp: 0,
      enteredTrial: 0,
      convertedLast30Days: 0,
    });
    configGet.mockReturnValue('sk_test_abc123');
    const service = new AdminBillingOverviewService(prisma, config);
    const now = new Date('2026-07-21T00:00:00.000Z');

    await service.getOverview(now);

    expect(subscriptionCount).toHaveBeenNthCalledWith(2, {
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: { gt: now },
      },
    });
  });

  describe('isStripeTestMode', () => {
    it('is true when STRIPE_SECRET_KEY is unset', async () => {
      queueCounts({
        totalActiveSubscriptions: 0,
        trialsCurrentlyActive: 0,
        totalEverTrialed: 0,
        totalConverted: 0,
        canceledOrExpiredCount: 0,
        signedUp: 0,
        enteredTrial: 0,
        convertedLast30Days: 0,
      });
      configGet.mockReturnValue(undefined);
      const service = new AdminBillingOverviewService(prisma, config);

      expect((await service.getOverview()).isStripeTestMode).toBe(true);
    });

    it('is true for a sk_test_ key', async () => {
      queueCounts({
        totalActiveSubscriptions: 0,
        trialsCurrentlyActive: 0,
        totalEverTrialed: 0,
        totalConverted: 0,
        canceledOrExpiredCount: 0,
        signedUp: 0,
        enteredTrial: 0,
        convertedLast30Days: 0,
      });
      configGet.mockReturnValue('sk_test_abc123');
      const service = new AdminBillingOverviewService(prisma, config);

      expect((await service.getOverview()).isStripeTestMode).toBe(true);
    });

    it('is false for a sk_live_ key', async () => {
      queueCounts({
        totalActiveSubscriptions: 0,
        trialsCurrentlyActive: 0,
        totalEverTrialed: 0,
        totalConverted: 0,
        canceledOrExpiredCount: 0,
        signedUp: 0,
        enteredTrial: 0,
        convertedLast30Days: 0,
      });
      configGet.mockReturnValue('sk_live_abc123');
      const service = new AdminBillingOverviewService(prisma, config);

      expect((await service.getOverview()).isStripeTestMode).toBe(false);
    });
  });
});
