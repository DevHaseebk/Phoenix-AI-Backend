import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminConversationsService } from './admin-conversations.service';
import { ListAdminConversationsQueryDto } from './dto/list-admin-conversations-query.dto';

// Privacy-sensitive: this is the only admin/ controller that reads real
// user message content, not just business/structured data. list() never
// returns message content (metadata/counts only); getById() does, and
// every call to it is recorded to the Audit Log (see
// AdminConversationsService.getById()) - viewing private data is itself an
// audited action here, not just mutations.
@ApiTags('Admin - AI Conversations')
@Controller('admin/conversations')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminConversationsController {
  constructor(
    private readonly adminConversationsService: AdminConversationsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListAdminConversationsQueryDto) {
    const data = await this.adminConversationsService.list(query);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getById(
    @Param('id') id: string,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.adminConversationsService.getById(
      id,
      adminUser.userId,
    );

    return successResponse(data, 'Fetched successfully', {});
  }
}
