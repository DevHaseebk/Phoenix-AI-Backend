import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_PROVIDER } from './ai-provider.interface';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FoodItemsService } from './food/food-items.service';
import { FoodMatchingService } from './food/food-matching.service';
import { MealItemResolverService } from './food/meal-item-resolver.service';
import { UnknownFoodQueueService } from './food/unknown-food-queue.service';
import { UnknownFoodsController } from './food/unknown-foods.controller';
import { MealPlanService } from './meal-plan/meal-plan.service';
import { MealPlansController } from './meal-plan/meal-plans.controller';
import { MemoriesController } from './memory/memories.controller';
import { MemoryService } from './memory/memory.service';
import { NotificationsController } from './nudges/notifications.controller';
import { NudgeService } from './nudges/nudge.service';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LocalAiProvider } from './providers/local-ai.provider';
import { RagService } from './rag/rag.service';
import { ReviewService } from './review/review.service';
import { ReviewsController } from './review/reviews.controller';
import { RewardsController } from './rewards/rewards.controller';
import { RewardsService } from './rewards/rewards.service';
import { UserStateService } from './user-state/user-state.service';

@Module({
  imports: [AuthModule, PrismaModule, DashboardModule],
  controllers: [
    AiController,
    MemoriesController,
    NotificationsController,
    UnknownFoodsController,
    MealPlansController,
    ReviewsController,
    RewardsController,
  ],
  providers: [
    AiService,
    RagService,
    MemoryService,
    UserStateService,
    NudgeService,
    FoodMatchingService,
    FoodItemsService,
    UnknownFoodQueueService,
    MealItemResolverService,
    MealPlanService,
    ReviewService,
    RewardsService,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const aiEnabled = config.get<string>('AI_ENABLED') !== 'false';
        const provider = config.get<string>('AI_PROVIDER') ?? 'gemini';
        const geminiApiKey = config.get<string>('GEMINI_API_KEY');

        if (!aiEnabled || provider === 'local' || !geminiApiKey) {
          return new LocalAiProvider();
        }

        return new GeminiAiProvider(geminiApiKey);
      },
    },
  ],
})
export class AiModule {}
