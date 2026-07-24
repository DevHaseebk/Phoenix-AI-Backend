import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

@ApiTags('Admin - Audit Log')
@Controller('admin/audit-log')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListAuditLogQueryDto) {
    const data = await this.auditLogService.list(query);

    return successResponse(data, 'Fetched successfully', {});
  }
}
