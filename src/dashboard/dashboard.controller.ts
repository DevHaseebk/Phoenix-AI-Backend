import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getToday(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.dashboardService.getToday(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get('summary')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getSummary(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: DashboardSummaryQueryDto,
  ) {
    const data = await this.dashboardService.getSummary(
      currentUser.userId,
      query.range,
    );

    return successResponse(data, 'Fetched successfully', {});
  }
}
