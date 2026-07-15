import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

/**
 * All Stripe-SDK-specific code lives here (task's own design instruction:
 * "keep Stripe specifics out of the access-check/business logic"). Nothing
 * outside this file and billing.controller.ts imports the `stripe` package
 * or a `Stripe.*` type, so swapping providers later only touches these two
 * files, not SubscriptionAccessService or any AI Coach entry point.
 */
@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');

    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  async createCheckoutSession(input: {
    userId: string;
    email: string;
    existingStripeCustomerId: string | null;
  }): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID');
    const frontendUrl = this.getFrontendUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id is how the webhook maps checkout.session.completed
      // back to our own Subscription row without waiting on a second
      // customer.subscription.* event.
      client_reference_id: input.userId,
      customer: input.existingStripeCustomerId ?? undefined,
      customer_email: input.existingStripeCustomerId ? undefined : input.email,
      success_url: `${frontendUrl}/upgrade?checkout=success`,
      cancel_url: `${frontendUrl}/upgrade?checkout=canceled`,
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }

    return { url: session.url };
  }

  async createPortalSession(
    stripeCustomerId: string,
  ): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const frontendUrl = this.getFrontendUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${frontendUrl}/settings/profile`,
    });

    return { url: session.url };
  }

  /** Verifies the webhook signature via STRIPE_WEBHOOK_SECRET - throws if
   * unset/invalid, so an unverified payload is never processed. */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): Stripe.Event {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook is not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      // Stripe.errors.StripeSignatureVerificationError isn't a NestJS
      // HttpException, so left uncaught it surfaces as an opaque 500
      // (verified live: an invalid/forged Stripe-Signature produced a 500
      // during manual testing) - normalized to a clean 400 here, since an
      // unverified payload is a client error, never processed either way.
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Billing is not configured');
    }

    return this.stripe;
  }

  private getFrontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }
}

/** Maps a Stripe subscription-object status string to our local enum - one
 * place, reused by every webhook event that carries a Stripe Subscription. */
export function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
    case 'incomplete_expired':
      return SubscriptionStatus.CANCELED;
    case 'incomplete':
    case 'paused':
    default:
      return SubscriptionStatus.EXPIRED;
  }
}
