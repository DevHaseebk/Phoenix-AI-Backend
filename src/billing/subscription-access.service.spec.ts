import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { trialDailyAiActionLimit } from './subscription-access.constants';

describe('SubscriptionAccessService', () => {
  const subscriptionFindUnique = jest.fn();
  const subscriptionUpdate = jest.fn();
  const subscriptionUpsert = jest.fn();
  const aiUsageEventCount = jest.fn();
  const aiUsageEventCreate = jest.fn();
  const userProfileFindUnique = jest.fn();
  const prisma = {
    subscription: {
      findUnique: subscriptionFindUnique,
      update: subscriptionUpdate,
      upsert: subscriptionUpsert,
    },
    aiUsageEvent: { count: aiUsageEventCount, create: aiUsageEventCreate },
    userProfile: { findUnique: userProfileFindUnique },
  } as unknown as PrismaService;

  function createService(): SubscriptionAccessService {
    return new SubscriptionAccessService(prisma);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    userProfileFindUnique.mockResolvedValue({ timezone: 'Asia/Karachi' });
  });

  describe('getAccessLevel', () => {
    it('returns LOCKED when the user has no subscription row', async () => {
      subscriptionFindUnique.mockResolvedValue(null);
      const service = createService();

      const result = await service.getAccessLevel('user-1');

      expect(result.level).toBe('LOCKED');
    });

    it('returns FULL_UNLIMITED when accessOverride is true, regardless of status', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.EXPIRED,
        trialEndsAt: new Date(Date.now() - 1000),
        accessOverride: true,
      });
      const service = createService();

      const result = await service.getAccessLevel('user-1');

      expect(result.level).toBe('FULL_UNLIMITED');
    });

    it('returns FULL_UNLIMITED when status is ACTIVE', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        accessOverride: false,
      });
      const service = createService();

      const result = await service.getAccessLevel('user-1');

      expect(result.level).toBe('FULL_UNLIMITED');
    });

    it('returns TRIAL_LIMITED when TRIALING and trialEndsAt is in the future', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        accessOverride: false,
      });
      const service = createService();

      const result = await service.getAccessLevel('user-1');

      expect(result.level).toBe('TRIAL_LIMITED');
    });

    it('returns LOCKED when TRIALING but trialEndsAt has passed', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() - 1000),
        accessOverride: false,
      });
      const service = createService();

      const result = await service.getAccessLevel('user-1');

      expect(result.level).toBe('LOCKED');
    });

    it('returns LOCKED for CANCELED/PAST_DUE/EXPIRED statuses', async () => {
      const service = createService();

      for (const status of [
        SubscriptionStatus.CANCELED,
        SubscriptionStatus.PAST_DUE,
        SubscriptionStatus.EXPIRED,
      ]) {
        subscriptionFindUnique.mockResolvedValue({
          userId: 'user-1',
          status,
          trialEndsAt: null,
          accessOverride: false,
        });

        const result = await service.getAccessLevel('user-1');

        expect(result.level).toBe('LOCKED');
      }
    });
  });

  describe('checkAiCoachAccess', () => {
    it('allows FULL_UNLIMITED users without counting usage', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        accessOverride: false,
      });
      const service = createService();

      const result = await service.checkAiCoachAccess('user-1', 'CHAT');

      expect(result).toEqual({ allowed: true, level: 'FULL_UNLIMITED' });
      expect(aiUsageEventCount).not.toHaveBeenCalled();
    });

    it('blocks LOCKED users with a friendly message, never calling the AI provider path', async () => {
      subscriptionFindUnique.mockResolvedValue(null);
      const service = createService();

      const result = await service.checkAiCoachAccess('user-1', 'CHAT');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('LOCKED');
      expect(result.message).toEqual(expect.any(String));
    });

    it('allows TRIAL_LIMITED users under the daily cap and reports usage counts', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        accessOverride: false,
      });
      aiUsageEventCount.mockResolvedValue(trialDailyAiActionLimit - 1);
      const service = createService();

      const result = await service.checkAiCoachAccess('user-1', 'CHAT');

      expect(result.allowed).toBe(true);
      expect(result.trialMessagesUsedToday).toBe(trialDailyAiActionLimit - 1);
      expect(result.trialMessagesLimit).toBe(trialDailyAiActionLimit);
    });

    it('blocks TRIAL_LIMITED users once the daily cap is reached', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        accessOverride: false,
      });
      aiUsageEventCount.mockResolvedValue(trialDailyAiActionLimit);
      const service = createService();

      const result = await service.checkAiCoachAccess('user-1', 'CHAT');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('TRIAL_LIMIT_REACHED');
    });

    it('scopes the daily count to the user local day (Asia/Karachi timezone helper), not raw UTC midnight', async () => {
      subscriptionFindUnique.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        accessOverride: false,
      });
      aiUsageEventCount.mockResolvedValue(0);
      const service = createService();

      await service.checkAiCoachAccess('user-1', 'CHAT');

      expect(userProfileFindUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { timezone: true },
      });
      const [[countArgs]] = aiUsageEventCount.mock.calls as [
        [{ where: { userId: string; createdAt: { gte: Date; lte: Date } } }],
      ];
      expect(countArgs.where.userId).toBe('user-1');
      expect(countArgs.where.createdAt.gte.getTime()).toBeLessThan(
        countArgs.where.createdAt.lte.getTime(),
      );
    });
  });

  describe('recordUsage', () => {
    it('inserts an AiUsageEvent row for the given user/feature', async () => {
      const service = createService();

      await service.recordUsage('user-1', 'MEAL_PLAN');

      expect(aiUsageEventCreate).toHaveBeenCalledWith({
        data: { userId: 'user-1', feature: 'MEAL_PLAN' },
        select: { id: true },
      });
    });
  });

  describe('trialSubscriptionCreateData', () => {
    it('creates a TRIALING row with trialEndsAt 7 days out', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');

      const data = SubscriptionAccessService.trialSubscriptionCreateData(now);

      expect(data.status).toBe(SubscriptionStatus.TRIALING);
      expect(data.trialEndsAt).toEqual(new Date('2026-01-08T00:00:00.000Z'));
    });
  });

  describe('syncFromStripeEvent', () => {
    it('upserts by userId when provided (checkout.session.completed)', async () => {
      const service = createService();

      await service.syncFromStripeEvent({
        userId: 'user-1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      });

      expect(subscriptionUpsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: {
          userId: 'user-1',
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
        },
        update: {
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      // The userId path must never fall back to the find-then-update branch -
      // that was exactly the bug (a missing row silently no-oped).
      expect(subscriptionUpdate).not.toHaveBeenCalled();
    });

    it('REGRESSION: activates a paid user who has NO existing Subscription row (pre-billing account)', async () => {
      // The real production incident: a founder account created before the
      // billing feature shipped had no Subscription row, so a delivered, paid
      // checkout.session.completed webhook returned 200 but left the user
      // LOCKED. The upsert must CREATE the row here, not no-op.
      subscriptionUpsert.mockResolvedValue({ id: 'newly-created-row' });
      const service = createService();

      await service.syncFromStripeEvent({
        userId: 'legacy-user',
        stripeCustomerId: 'cus_legacy',
        stripeSubscriptionId: 'sub_legacy',
        status: SubscriptionStatus.ACTIVE,
      });

      expect(subscriptionUpsert).toHaveBeenCalledTimes(1);
      const [[call]] = subscriptionUpsert.mock.calls as [
        [
          {
            where: { userId: string };
            create: { userId: string; status: SubscriptionStatus };
          },
        ],
      ];
      expect(call.where).toEqual({ userId: 'legacy-user' });
      expect(call.create.userId).toBe('legacy-user');
      expect(call.create.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('does nothing when a customer-keyed event (no userId) matches no local row', async () => {
      subscriptionFindUnique.mockResolvedValue(null);
      const service = createService();

      await service.syncFromStripeEvent({
        stripeCustomerId: 'cus_unknown',
        status: SubscriptionStatus.ACTIVE,
      });

      expect(subscriptionUpsert).not.toHaveBeenCalled();
      expect(subscriptionUpdate).not.toHaveBeenCalled();
    });

    it('updates the matched row for a subscription-keyed event (customer.subscription.updated)', async () => {
      subscriptionFindUnique.mockResolvedValue({
        id: 'sub-row-9',
        stripeCustomerId: 'cus_9',
        stripeSubscriptionId: 'sub_9',
        currentPeriodEnd: null,
      });
      const service = createService();

      await service.syncFromStripeEvent({
        stripeSubscriptionId: 'sub_9',
        status: SubscriptionStatus.CANCELED,
      });

      expect(subscriptionFindUnique).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_9' },
      });
      expect(subscriptionUpsert).not.toHaveBeenCalled();
      expect(subscriptionUpdate).toHaveBeenCalledWith({
        where: { id: 'sub-row-9' },
        data: {
          status: SubscriptionStatus.CANCELED,
          stripeCustomerId: 'cus_9',
          stripeSubscriptionId: 'sub_9',
          currentPeriodEnd: null,
        },
        select: { id: true },
      });
    });
  });
});
