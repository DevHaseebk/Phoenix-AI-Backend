import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
import { GenerateWeeklyReviewDto } from './dto/generate-weekly-review.dto';
import { ListWeeklyReviewsQueryDto } from './dto/list-weekly-reviews-query.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('reviews/weekly')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  @Get('latest')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async latest(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.reviewService.getLatest(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get('history')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async history(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListWeeklyReviewsQueryDto,
  ) {
    const data = await this.reviewService.getHistory(currentUser.userId, query);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post('generate')
  @ApiCreatedResponse({ description: 'Weekly review generated successfully' })
  async generate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: GenerateWeeklyReviewDto,
  ) {
    // Subscription/Trial gate (docs/16_Claude_Code_Handover.md) - same
    // pattern as meal-plan generate(): a blocked response replaces the
    // normal generated-review payload rather than a thrown HTTP error.
    const gate = await this.subscriptionAccessService.checkAiCoachAccess(
      currentUser.userId,
      'WEEKLY_REVIEW',
    );

    if (!gate.allowed) {
      return successResponse(
        { blocked: true, reason: gate.reason, message: gate.message },
        gate.message ?? 'Upgrade required',
        {},
      );
    }

    const data = await this.reviewService.generate(
      currentUser.userId,
      dto.weekStart,
    );

    if (gate.level === 'TRIAL_LIMITED') {
      await this.subscriptionAccessService.recordUsage(
        currentUser.userId,
        'WEEKLY_REVIEW',
      );
    }

    return successResponse(data, 'Weekly review generated successfully', {});
  }
}
