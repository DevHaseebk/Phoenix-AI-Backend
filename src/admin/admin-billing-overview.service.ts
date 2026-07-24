import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Single Pro tier's real Stripe test-mode price (docs/16_Claude_Code_
 * Handover.md's Subscription/Trial Flow note: "$10/month"). Not fetched live
 * from Stripe - there is exactly one price/tier in this product today, and a
 * live API call for a fixed multiplier isn't worth the extra failure mode on
 * a read-only overview screen. Update this constant if the price ever
 * changes (or the product adds a second tier, at which point this whole
 * single-price-times-count MRR approach needs revisiting). */
const MONTHLY_PRICE_USD = 10;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface AdminBillingFunnel {
  signedUp: number;
  enteredTrial: number;
  converted: number;
}

export interface AdminBillingOverview {
  totalActiveSubscriptions: number;
  mrrUsd: number;
  mrrPerSubscriptionUsd: number;
  trialsCurrentlyActive: number;
  /** converted ÷ totalEverTrialed, all-time (see totalEverTrialed/
   * totalConverted's own doc comments for exactly what each counts). 0 when
   * totalEverTrialed is 0. */
  trialToPaidConversionRate: number;
  totalEverTrialed: number;
  totalConverted: number;
  canceledOrExpiredCount: number;
  /** True when STRIPE_SECRET_KEY is unset or starts with `sk_test_` - i.e.
   * every number above reflects Stripe test-mode activity, not real revenue. */
  isStripeTestMode: boolean;
  funnelLast30Days: AdminBillingFunnel;
}

/**
 * Read-only billing/revenue analytics for the admin panel. No dedicated
 * subscription-history/event table exists in this schema (billing state is
 * a single current-snapshot row per user, kept in sync by Stripe webhooks -
 * see subscription-access.service.ts), so "conversion" here is derived from
 * the best available proxy rather than a true funnel-with-timestamps:
 * `stripeSubscriptionId IS NOT NULL` means the user completed a real Stripe
 * Checkout at least once (set at `checkout.session.completed` and never
 * cleared afterward, even if they later cancel) - a durable "ever converted"
 * signal that survives a later cancellation, unlike `status`, which moves
 * away from ACTIVE the moment a subscription is canceled/expires.
 */
@Injectable()
export class AdminBillingOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getOverview(now = new Date()): Promise<AdminBillingOverview> {
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

    const [
      totalActiveSubscriptions,
      trialsCurrentlyActive,
      totalEverTrialed,
      totalConverted,
      canceledOrExpiredCount,
      signedUp,
      enteredTrial,
      convertedLast30Days,
    ] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: { gt: now },
        },
      }),
      // Every signup auto-creates a Subscription row starting TRIALING (see
      // SubscriptionAccessService.trialSubscriptionCreateData) - so the total
      // row count is, by design, the total number of users who ever started
      // a trial.
      this.prisma.subscription.count(),
      this.prisma.subscription.count({
        where: { stripeSubscriptionId: { not: null } },
      }),
      this.prisma.subscription.count({
        where: {
          status: {
            in: [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED],
          },
        },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.subscription.count({
        where: { user: { createdAt: { gte: thirtyDaysAgo } } },
      }),
      this.prisma.subscription.count({
        where: {
          user: { createdAt: { gte: thirtyDaysAgo } },
          stripeSubscriptionId: { not: null },
        },
      }),
    ]);

    return {
      totalActiveSubscriptions,
      mrrUsd: totalActiveSubscriptions * MONTHLY_PRICE_USD,
      mrrPerSubscriptionUsd: MONTHLY_PRICE_USD,
      trialsCurrentlyActive,
      trialToPaidConversionRate:
        totalEverTrialed === 0 ? 0 : totalConverted / totalEverTrialed,
      totalEverTrialed,
      totalConverted,
      canceledOrExpiredCount,
      isStripeTestMode: this.isStripeTestMode(),
      funnelLast30Days: {
        signedUp,
        enteredTrial,
        converted: convertedLast30Days,
      },
    };
  }

  private isStripeTestMode(): boolean {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');

    return !secretKey || secretKey.startsWith('sk_test_');
  }
}
