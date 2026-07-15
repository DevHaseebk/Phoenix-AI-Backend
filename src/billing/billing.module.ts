import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';
import { SubscriptionAccessService } from './subscription-access.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BillingController, InternalUsersController],
  providers: [BillingService, SubscriptionAccessService, InternalUsersService],
  exports: [SubscriptionAccessService],
})
export class BillingModule {}
