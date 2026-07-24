import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { AdminUsersService } from './admin-users.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminAccessOverrideDto } from './dto/update-admin-access-override.dto';

@ApiTags('Admin - Users')
@Controller('admin/users')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListAdminUsersQueryDto) {
    const data = await this.adminUsersService.list(query);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id/access-override')
  @ApiOkResponse({ description: 'Access override updated successfully' })
  async setAccessOverride(
    @Param('id') id: string,
    @Body() dto: UpdateAdminAccessOverrideDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.adminUsersService.setAccessOverride(
      id,
      dto.accessOverride,
      adminUser.userId,
    );

    return successResponse(data, 'Access override updated successfully', {});
  }
}
