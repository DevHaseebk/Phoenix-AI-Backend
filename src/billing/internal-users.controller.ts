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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { successResponse } from '../common/responses/response.helper';
import { ListInternalUsersQueryDto } from './dto/list-internal-users-query.dto';
import { UpdateAccessOverrideDto } from './dto/update-access-override.dto';
import { InternalUsersService } from './internal-users.service';

// NOTE (security gap, documented per task instructions - same accepted
// precedent as ai/food/unknown-foods.controller.ts): these endpoints are
// founder/operator-facing (comping test users/friends/family with free
// access), not user-facing, but this project has no admin-role/permission
// system yet. Gated behind plain JwtAuthGuard only, so any authenticated
// user can technically reach them via a direct API call. Accepted, known-
// for-now gap - do not build RBAC here, out of scope for this task.
@ApiTags('Internal - Users')
@Controller('internal/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InternalUsersController {
  constructor(private readonly internalUsersService: InternalUsersService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListInternalUsersQueryDto) {
    const data = await this.internalUsersService.list(query);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id/access-override')
  @ApiOkResponse({ description: 'Access override updated successfully' })
  async setAccessOverride(
    @Param('id') id: string,
    @Body() dto: UpdateAccessOverrideDto,
  ) {
    const data = await this.internalUsersService.setAccessOverride(
      id,
      dto.accessOverride,
    );

    return successResponse(data, 'Access override updated successfully', {});
  }
}
