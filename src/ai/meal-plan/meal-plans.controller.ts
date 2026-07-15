import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { SubscriptionAccessService } from '../../billing/subscription-access.service';
import { successResponse } from '../../common/responses/response.helper';
import { UpdateGroceryItemDto } from './dto/update-grocery-item.dto';
import { MealPlanService } from './meal-plan.service';

@ApiTags('AI - Meal Plan')
@Controller('ai/meal-plan')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MealPlansController {
  constructor(
    private readonly mealPlanService: MealPlanService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  @Post('generate')
  @ApiCreatedResponse({ description: 'Meal plan generated successfully' })
  async generate(@CurrentUser() currentUser: AuthenticatedUser) {
    // Subscription/Trial gate (docs/16_Claude_Code_Handover.md): meal-plan
    // generation is an "AI Coach" feature per this task's scope, gated the
    // same way as chat()/estimateMeal() - a blocked response replaces the
    // normal generated-plan payload rather than throwing a generic error.
    const gate = await this.subscriptionAccessService.checkAiCoachAccess(
      currentUser.userId,
      'MEAL_PLAN',
    );

    if (!gate.allowed) {
      return successResponse(
        { blocked: true, reason: gate.reason, message: gate.message },
        gate.message ?? 'Upgrade required',
        {},
      );
    }

    const data = await this.mealPlanService.generateForUser(currentUser.userId);

    if (gate.level === 'TRIAL_LIMITED') {
      await this.subscriptionAccessService.recordUsage(
        currentUser.userId,
        'MEAL_PLAN',
      );
    }

    return successResponse(data, 'Meal plan generated successfully', {});
  }

  @Get('current')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async current(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.mealPlanService.getCurrentPlan(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch('grocery-items/:id')
  @ApiOkResponse({ description: 'Grocery item updated successfully' })
  async updateGroceryItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroceryItemDto,
  ) {
    const data = await this.mealPlanService.setGroceryItemChecked(
      currentUser.userId,
      id,
      dto.checked,
    );

    return successResponse(data, 'Grocery item updated successfully', {});
  }
}
