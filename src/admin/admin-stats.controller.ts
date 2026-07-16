import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminStatsService } from './admin-stats.service';

@ApiTags('Admin - Stats')
@Controller('admin/stats')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getStats() {
    const data = await this.adminStatsService.getStats();

    return successResponse(data, 'Fetched successfully', {});
  }
}
