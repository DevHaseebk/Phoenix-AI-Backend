import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.usersService.getCurrentUser(currentUser.userId);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const data = await this.usersService.updateProfile(
      currentUser.userId,
      updateProfileDto,
    );

    return successResponse(data, 'Profile updated successfully', {});
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const data = await this.usersService.changePassword(
      currentUser.userId,
      changePasswordDto,
    );

    return successResponse(data, 'Password changed successfully', {});
  }
}
