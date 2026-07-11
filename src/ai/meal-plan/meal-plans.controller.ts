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
import { successResponse } from '../../common/responses/response.helper';
import { UpdateGroceryItemDto } from './dto/update-grocery-item.dto';
import { MealPlanService } from './meal-plan.service';

@ApiTags('AI - Meal Plan')
@Controller('ai/meal-plan')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MealPlansController {
  constructor(private readonly mealPlanService: MealPlanService) {}

  @Post('generate')
  @ApiCreatedResponse({ description: 'Meal plan generated successfully' })
  async generate(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.mealPlanService.generateForUser(currentUser.userId);

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
