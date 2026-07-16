import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { getTodayRangeForTimezone } from '../dashboard/dashboard-timezone';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiCoachFeature,
  AiGateResult,
  lockedMessage,
  SubscriptionAccessLevel,
  trialDailyAiActionLimit,
  trialLimitReachedMessage,
  trialPeriodDays,
} from './subscription-access.constants';

export interface BillingStatusResponse {
  status: SubscriptionStatus;
  level: SubscriptionAccessLevel;
  trialEndsAt: Date | null;
  trialDaysRemaining: number | null;
  currentPeriodEnd: Date | null;
  accessOverride: boolean;
  aiActionsUsedToday: number | null;
  aiActionsLimitPerDay: number | null;
}

/** Plain, Stripe-SDK-free shape the billing controller extracts from a
 * verified webhook event - keeps this service (and its unit tests) free of
 * any Stripe types, per the task's "keep Stripe specifics out of the
 * access-check/business logic" instruction. */
export interface StripeSubscriptionSync {
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date | null;
}

const defaultTimezone = 'Asia/Karachi';

@Injectable()
export class SubscriptionAccessService {
  private readonly logger = new Logger(SubscriptionAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nested-create shape for AuthService.signup()/loginWithGoogle() - a
   * brand-new user starts a 7-day trial immediately, no card required. */
  static trialSubscriptionCreateData(
    now = new Date(),
  ): Prisma.SubscriptionCreateWithoutUserInput {
    return {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: new Date(
        now.getTime() + trialPeriodDays * 24 * 60 * 60 * 1000,
      ),
    };
  }

  async getAccessLevel(userId: string): Promise<{
    level: SubscriptionAccessLevel;
    subscription: Subscription | null;
  }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      // Defensive only: every signup path creates this row. A user somehow
      // missing one (e.g. seeded directly in the DB) is treated as LOCKED
      // rather than silently granted free access - a founder can still comp
      // them via the accessOverride toggle.
      return { level: 'LOCKED', subscription: null };
    }

    if (subscription.accessOverride) {
      return { level: 'FULL_UNLIMITED', subscription };
    }

    if (subscription.status === SubscriptionStatus.ACTIVE) {
      return { level: 'FULL_UNLIMITED', subscription };
    }

    if (
      subscription.status === SubscriptionStatus.TRIALING &&
      subscription.trialEndsAt !== null &&
      subscription.trialEndsAt.getTime() > Date.now()
    ) {
      return { level: 'TRIAL_LIMITED', subscription };
    }

    return { level: 'LOCKED', subscription };
  }

  /**
   * Gate check for chat()/estimateMeal() (ai.service.ts) and the meal-plan/
   * weekly-review generate() controllers. Callers must call recordUsage()
   * themselves only after the gated action actually succeeds - this method
   * never has a side effect, so a caller that decides not to proceed (e.g. a
   * safety-flag short-circuit that never touches the AI provider) never
   * consumes trial quota for a check it didn't act on.
   */
  async checkAiCoachAccess(
    userId: string,
    feature: AiCoachFeature,
  ): Promise<AiGateResult> {
    const { level } = await this.getAccessLevel(userId);

    if (level === 'FULL_UNLIMITED') {
      return { allowed: true, level };
    }

    if (level === 'LOCKED') {
      this.logger.log(
        `AI Coach access LOCKED for user ${userId} (${feature}).`,
      );

      return {
        allowed: false,
        level,
        reason: 'LOCKED',
        message: lockedMessage,
      };
    }

    const usedToday = await this.countTodayUsage(userId);

    if (usedToday >= trialDailyAiActionLimit) {
      return {
        allowed: false,
        level,
        reason: 'TRIAL_LIMIT_REACHED',
        message: trialLimitReachedMessage,
        trialMessagesUsedToday: usedToday,
        trialMessagesLimit: trialDailyAiActionLimit,
      };
    }

    return {
      allowed: true,
      level,
      trialMessagesUsedToday: usedToday,
      trialMessagesLimit: trialDailyAiActionLimit,
    };
  }

  /** Only TRIAL_LIMITED usage is recorded - FULL_UNLIMITED has nothing to
   * cap, and LOCKED calls never reach this (checkAiCoachAccess already
   * blocked them), so this table only ever grows in proportion to actual
   * trial usage. */
  async recordUsage(userId: string, feature: AiCoachFeature): Promise<void> {
    await this.prisma.aiUsageEvent.create({
      data: { userId, feature },
      select: { id: true },
    });
  }

  async getStatus(userId: string): Promise<BillingStatusResponse> {
    const { level, subscription } = await this.getAccessLevel(userId);

    if (!subscription) {
      return {
        status: SubscriptionStatus.EXPIRED,
        level,
        trialEndsAt: null,
        trialDaysRemaining: null,
        currentPeriodEnd: null,
        accessOverride: false,
        aiActionsUsedToday: null,
        aiActionsLimitPerDay: null,
      };
    }

    const trialDaysRemaining =
      subscription.trialEndsAt !== null
        ? Math.max(
            0,
            Math.ceil(
              (subscription.trialEndsAt.getTime() - Date.now()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : null;
    const usedToday =
      level === 'TRIAL_LIMITED' ? await this.countTodayUsage(userId) : null;

    return {
      status: subscription.status,
      level,
      trialEndsAt: subscription.trialEndsAt,
      trialDaysRemaining,
      currentPeriodEnd: subscription.currentPeriodEnd,
      accessOverride: subscription.accessOverride,
      aiActionsUsedToday: usedToday,
      aiActionsLimitPerDay:
        level === 'TRIAL_LIMITED' ? trialDailyAiActionLimit : null,
    };
  }

  /** Applied from BillingController's webhook handler after Stripe signature
   * verification (billing.service.ts) - this method itself never touches
   * the Stripe SDK, only plain already-verified values. */
  async syncFromStripeEvent(sync: StripeSubscriptionSync): Promise<void> {
    // `checkout.session.completed` is the authoritative "this user just paid"
    // signal, and the ONLY Stripe event that carries OUR userId (as the
    // checkout session's client_reference_id). Upsert by userId so a paying
    // user who has no Subscription row yet is still activated.
    //
    // This is the exact bug fixed here (2026-07-15): the previous code did a
    // find-then-update and silently no-oped when no row existed, so any
    // account created BEFORE the billing feature shipped (auto-trial-row
    // creation didn't exist until 2026-07-15) had no Subscription row, and a
    // real, delivered, *paid* webhook returned 200 OK while leaving the user
    // LOCKED. Upsert (create-or-update) closes that hole for every such user,
    // not just the one who hit it.
    if (sync.userId) {
      await this.prisma.subscription.upsert({
        where: { userId: sync.userId },
        create: {
          userId: sync.userId,
          status: sync.status,
          stripeCustomerId: sync.stripeCustomerId ?? null,
          stripeSubscriptionId: sync.stripeSubscriptionId ?? null,
          currentPeriodEnd: sync.currentPeriodEnd ?? null,
        },
        update: {
          status: sync.status,
          // `undefined` = leave column unchanged (preserves whatever a prior
          // event stored); a real incoming value overwrites it.
          stripeCustomerId: sync.stripeCustomerId ?? undefined,
          stripeSubscriptionId: sync.stripeSubscriptionId ?? undefined,
          currentPeriodEnd: sync.currentPeriodEnd ?? undefined,
        },
        select: { id: true },
      });

      return;
    }

    // Subscription-lifecycle events (customer.subscription.*, invoice.*) do
    // NOT carry our userId - they can only be matched to the row Stripe was
    // already linked to at checkout time. With no userId there is no safe way
    // to know which user a brand-new row belongs to, so a genuine miss is
    // logged and skipped (the checkout.session.completed event is what creates
    // the row in the first place).
    const where: Prisma.SubscriptionWhereUniqueInput | null =
      sync.stripeSubscriptionId
        ? { stripeSubscriptionId: sync.stripeSubscriptionId }
        : sync.stripeCustomerId
          ? { stripeCustomerId: sync.stripeCustomerId }
          : null;

    if (!where) {
      this.logger.warn(
        'Received a Stripe subscription event with no userId/customerId/subscriptionId to match against.',
      );

      return;
    }

    const existing = await this.prisma.subscription.findUnique({ where });

    if (!existing) {
      this.logger.warn(
        `No local Subscription row found for Stripe sync (${JSON.stringify(where)}).`,
      );

      return;
    }

    await this.prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: sync.status,
        stripeCustomerId: sync.stripeCustomerId ?? existing.stripeCustomerId,
        stripeSubscriptionId:
          sync.stripeSubscriptionId ?? existing.stripeSubscriptionId,
        currentPeriodEnd: sync.currentPeriodEnd ?? existing.currentPeriodEnd,
      },
      select: { id: true },
    });
  }

  private async countTodayUsage(userId: string): Promise<number> {
    const timezone = await this.resolveTimezone(userId);
    const { startUtc, endUtc } = getTodayRangeForTimezone(timezone);

    return this.prisma.aiUsageEvent.count({
      where: {
        userId,
        createdAt: { gte: startUtc, lte: endUtc },
      },
    });
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    return profile?.timezone ?? defaultTimezone;
  }
}
