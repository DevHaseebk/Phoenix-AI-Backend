import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { successResponse } from '../../common/responses/response.helper';
import { NudgeService } from './nudge.service';

@ApiTags('Notifications')
@Controller('me/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly nudgeService: NudgeService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.nudgeService.getNotificationsForUser(
      currentUser.userId,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id/read')
  @ApiOkResponse({ description: 'Notification marked as read' })
  async markRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.nudgeService.markRead(currentUser.userId, id);

    return successResponse(null, 'Notification marked as read', {});
  }

  @Patch(':id/dismiss')
  @ApiOkResponse({ description: 'Notification dismissed' })
  async markDismissed(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.nudgeService.markDismissed(currentUser.userId, id);

    return successResponse(null, 'Notification dismissed', {});
  }
}
