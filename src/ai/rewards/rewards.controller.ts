import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { successResponse } from '../../common/responses/response.helper';
import { RewardsService } from './rewards.service';

@ApiTags('Rewards')
@Controller('rewards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getRewards(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.rewardsService.getRewards(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get('milestones')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getMilestones(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.rewardsService.getMilestones(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }
}
