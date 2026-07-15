import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import Stripe from 'stripe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService, mapStripeSubscriptionStatus } from './billing.service';
import { SubscriptionAccessService } from './subscription-access.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Checkout session created successfully' })
  async createCheckoutSession(@CurrentUser() currentUser: AuthenticatedUser) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: currentUser.userId },
      select: { stripeCustomerId: true },
    });
    const data = await this.billingService.createCheckoutSession({
      userId: currentUser.userId,
      email: currentUser.email,
      existingStripeCustomerId: subscription?.stripeCustomerId ?? null,
    });

    return successResponse(data, 'Checkout session created successfully', {});
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Portal session created successfully' })
  async portal(@CurrentUser() currentUser: AuthenticatedUser) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: currentUser.userId },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException(
        'No billing account yet - subscribe first to manage billing.',
      );
    }

    const data = await this.billingService.createPortalSession(
      subscription.stripeCustomerId,
    );

    return successResponse(data, 'Portal session created successfully', {});
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async status(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.subscriptionAccessService.getStatus(
      currentUser.userId,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  // Not guarded by JwtAuthGuard - Stripe calls this server-to-server;
  // authenticity comes from the signature check below, not a bearer token.
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Webhook processed' })
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    const event = this.billingService.constructWebhookEvent(
      request.rawBody,
      signature,
    );

    await this.handleEvent(event);

    return { received: true };
  }

  private async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id ?? undefined;
        const stripeCustomerId =
          typeof session.customer === 'string' ? session.customer : undefined;
        const stripeSubscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : undefined;

        await this.subscriptionAccessService.syncFromStripeEvent({
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          status: mapStripeSubscriptionStatus('active'),
        });

        return;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;

        await this.subscriptionAccessService.syncFromStripeEvent({
          stripeCustomerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : undefined,
          stripeSubscriptionId: subscription.id,
          status: mapStripeSubscriptionStatus(subscription.status),
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
        });

        return;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        await this.subscriptionAccessService.syncFromStripeEvent({
          stripeCustomerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : undefined,
          stripeSubscriptionId: subscription.id,
          status: mapStripeSubscriptionStatus('canceled'),
        });

        return;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeCustomerId =
          typeof invoice.customer === 'string' ? invoice.customer : undefined;

        if (!stripeCustomerId) {
          return;
        }

        await this.subscriptionAccessService.syncFromStripeEvent({
          stripeCustomerId,
          status: mapStripeSubscriptionStatus('past_due'),
        });

        return;
      }

      default:
        return;
    }
  }
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];

  return item ? new Date(item.current_period_end * 1000) : null;
}
