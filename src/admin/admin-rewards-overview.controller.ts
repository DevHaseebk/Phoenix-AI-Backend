import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminRewardsOverviewService } from './admin-rewards-overview.service';

@ApiTags('Admin - Rewards Overview')
@Controller('admin/rewards-overview')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminRewardsOverviewController {
  constructor(
    private readonly adminRewardsOverviewService: AdminRewardsOverviewService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getOverview() {
    const data = await this.adminRewardsOverviewService.getOverview();

    return successResponse(data, 'Fetched successfully', {});
  }
}
