import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingService, mapStripeSubscriptionStatus } from './billing.service';

describe('BillingService', () => {
  function buildConfig(values: Record<string, string> = {}): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (!values[key]) {
          throw new Error(`Missing ${key}`);
        }

        return values[key];
      }),
    } as unknown as ConfigService;
  }

  describe('isConfigured', () => {
    it('is false when STRIPE_SECRET_KEY is unset', () => {
      const service = new BillingService(buildConfig());

      expect(service.isConfigured()).toBe(false);
    });

    it('is true when STRIPE_SECRET_KEY is set', () => {
      const service = new BillingService(
        buildConfig({ STRIPE_SECRET_KEY: 'sk_test_123' }),
      );

      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('constructWebhookEvent', () => {
    it('throws when Stripe is not configured at all', () => {
      const service = new BillingService(buildConfig());

      expect(() =>
        service.constructWebhookEvent(Buffer.from('{}'), 'sig'),
      ).toThrow(BadRequestException);
    });

    it('throws when STRIPE_WEBHOOK_SECRET is unset', () => {
      const service = new BillingService(
        buildConfig({ STRIPE_SECRET_KEY: 'sk_test_123' }),
      );

      expect(() =>
        service.constructWebhookEvent(Buffer.from('{}'), 'sig'),
      ).toThrow(BadRequestException);
    });

    it('throws when the Stripe-Signature header is missing', () => {
      const service = new BillingService(
        buildConfig({
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
        }),
      );

      expect(() =>
        service.constructWebhookEvent(Buffer.from('{}'), undefined),
      ).toThrow(BadRequestException);
    });

    it('rejects a payload with an invalid/forged signature', () => {
      const service = new BillingService(
        buildConfig({
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
        }),
      );

      expect(() =>
        service.constructWebhookEvent(
          Buffer.from(JSON.stringify({ type: 'checkout.session.completed' })),
          't=1,v1=not-a-real-signature',
        ),
      ).toThrow(BadRequestException);
    });

    it('accepts a payload with a correctly-computed signature', () => {
      const webhookSecret = 'whsec_test_123';
      const service = new BillingService(
        buildConfig({
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_WEBHOOK_SECRET: webhookSecret,
        }),
      );
      const payload = Buffer.from(
        JSON.stringify({
          id: 'evt_1',
          object: 'event',
          type: 'checkout.session.completed',
          data: { object: {} },
        }),
      );
      const header = Stripe.webhooks.generateTestHeaderString({
        payload: payload.toString(),
        secret: webhookSecret,
      });

      const event = service.constructWebhookEvent(payload, header);

      expect(event.type).toBe('checkout.session.completed');
    });
  });

  describe('mapStripeSubscriptionStatus', () => {
    it('maps active/trialing to ACTIVE', () => {
      expect(mapStripeSubscriptionStatus('active')).toBe('ACTIVE');
      expect(mapStripeSubscriptionStatus('trialing')).toBe('ACTIVE');
    });

    it('maps past_due/unpaid to PAST_DUE', () => {
      expect(mapStripeSubscriptionStatus('past_due')).toBe('PAST_DUE');
      expect(mapStripeSubscriptionStatus('unpaid')).toBe('PAST_DUE');
    });

    it('maps canceled/incomplete_expired to CANCELED', () => {
      expect(mapStripeSubscriptionStatus('canceled')).toBe('CANCELED');
      expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe(
        'CANCELED',
      );
    });

    it('maps incomplete/paused to EXPIRED', () => {
      expect(mapStripeSubscriptionStatus('incomplete')).toBe('EXPIRED');
      expect(mapStripeSubscriptionStatus('paused')).toBe('EXPIRED');
    });
  });
});
