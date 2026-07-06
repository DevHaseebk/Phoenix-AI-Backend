import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { SaveOnboardingStepDto } from './dto/save-onboarding-step.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getState(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.onboardingService.getState(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post('step')
  @ApiOkResponse({ description: 'Onboarding step saved successfully' })
  async saveStep(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() saveStepDto: SaveOnboardingStepDto,
  ) {
    const data = await this.onboardingService.saveStep(
      currentUser.userId,
      saveStepDto,
    );

    return successResponse(data, 'Onboarding step saved successfully', {});
  }

  @Post('complete')
  @ApiOkResponse({ description: 'Onboarding completed successfully' })
  async complete(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() completeOnboardingDto: CompleteOnboardingDto,
  ) {
    const data = await this.onboardingService.complete(
      currentUser.userId,
      completeOnboardingDto,
    );

    return successResponse(data, 'Onboarding completed successfully', {});
  }
}
