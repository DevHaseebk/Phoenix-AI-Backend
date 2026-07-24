import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminSystemHealthService } from './admin-system-health.service';

@ApiTags('Admin - System Health')
@Controller('admin/system-health')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminSystemHealthController {
  constructor(
    private readonly adminSystemHealthService: AdminSystemHealthService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getHealth() {
    const data = await this.adminSystemHealthService.getHealth();

    return successResponse(data, 'Fetched successfully', {});
  }
}
