import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminBillingOverviewService } from './admin-billing-overview.service';

@ApiTags('Admin - Billing Overview')
@Controller('admin/billing-overview')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminBillingOverviewController {
  constructor(
    private readonly adminBillingOverviewService: AdminBillingOverviewService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getOverview() {
    const data = await this.adminBillingOverviewService.getOverview();

    return successResponse(data, 'Fetched successfully', {});
  }
}
