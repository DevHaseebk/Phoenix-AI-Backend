import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { GenerateWeeklyReviewDto } from './dto/generate-weekly-review.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('reviews/weekly')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('latest')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async latest(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.reviewService.getLatest(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post('generate')
  @ApiCreatedResponse({ description: 'Weekly review generated successfully' })
  async generate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: GenerateWeeklyReviewDto,
  ) {
    const data = await this.reviewService.generate(
      currentUser.userId,
      dto.weekStart,
    );

    return successResponse(data, 'Weekly review generated successfully', {});
  }
}
