import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../common/responses/response.helper';
import { CurrentUser } from './decorators/current-user.decorator';
import { AdminGuard } from './guards/admin.guard';
import type { AuthenticatedUser } from './types/authenticated-user.interface';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  @Get('me')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Fetched successfully' })
  getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return successResponse(
      {
        id: currentUser.userId,
        email: currentUser.email,
        fullName: currentUser.fullName,
        role: currentUser.role,
      },
      'Fetched successfully',
      {},
    );
  }
}
