import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminBillingOverviewController } from './admin-billing-overview.controller';
import { AdminBillingOverviewService } from './admin-billing-overview.service';
import { AdminConversationsController } from './admin-conversations.controller';
import { AdminConversationsService } from './admin-conversations.service';
import { AdminFoodItemsController } from './admin-food-items.controller';
import { AdminGoldenTestsController } from './admin-golden-tests.controller';
import { AdminGoldenTestsService } from './admin-golden-tests.service';
import { AdminRagController } from './admin-rag.controller';
import { AdminRagService } from './admin-rag.service';
import { AdminRewardsOverviewController } from './admin-rewards-overview.controller';
import { AdminRewardsOverviewService } from './admin-rewards-overview.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminSystemHealthController } from './admin-system-health.controller';
import { AdminSystemHealthService } from './admin-system-health.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthModule, PrismaModule, AiModule, AuditLogModule],
  controllers: [
    AdminStatsController,
    AdminUsersController,
    AdminRagController,
    AdminFoodItemsController,
    AdminBillingOverviewController,
    AdminRewardsOverviewController,
    AdminConversationsController,
    AdminSystemHealthController,
    AdminGoldenTestsController,
  ],
  providers: [
    AdminStatsService,
    AdminUsersService,
    AdminRagService,
    AdminBillingOverviewService,
    AdminRewardsOverviewService,
    AdminConversationsService,
    AdminSystemHealthService,
    AdminGoldenTestsService,
  ],
})
export class AdminModule {}
