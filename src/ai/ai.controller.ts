import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { MealConfirmDto } from './dto/meal-confirm.dto';
import { MealEstimateDto } from './dto/meal-estimate.dto';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiCreatedResponse({ description: 'AI response generated successfully' })
  async chat(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() chatDto: ChatDto,
  ) {
    const data = await this.aiService.chat(currentUser.userId, chatDto);

    return successResponse(data, 'AI response generated successfully', {});
  }

  @Post('meal-estimate')
  @ApiCreatedResponse({ description: 'Meal estimate generated successfully' })
  async estimateMeal(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() mealEstimateDto: MealEstimateDto,
  ) {
    const data = await this.aiService.estimateMeal(
      currentUser.userId,
      mealEstimateDto,
    );

    return successResponse(data, 'Meal estimate generated successfully', {});
  }

  @Post('meal-confirm')
  @ApiCreatedResponse({ description: 'Meal saved successfully' })
  async confirmMeal(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() mealConfirmDto: MealConfirmDto,
  ) {
    const data = await this.aiService.confirmMeal(
      currentUser.userId,
      mealConfirmDto,
    );

    return successResponse(data, 'Meal saved successfully', {});
  }

  @Get('conversations')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async listConversations(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    const data = await this.aiService.listConversations(
      currentUser.userId,
      query,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get('conversations/:id')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.aiService.getConversation(currentUser.userId, id);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Delete('conversations/:id')
  @ApiOkResponse({ description: 'Conversation archived successfully' })
  async archiveConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.aiService.archiveConversation(currentUser.userId, id);

    return successResponse(null, 'Conversation archived successfully', {});
  }
}
