import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { successResponse } from '../common/responses/response.helper';
import type { AuthenticatedUser } from './types/authenticated-user.interface';

@ApiTags('Sessions')
@Controller('me/sessions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('x-refresh-token') currentRefreshToken?: string,
  ) {
    const data = await this.sessionsService.listSessions(
      currentUser.userId,
      currentRefreshToken,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Session revoked successfully' })
  async revoke(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.sessionsService.revokeSession(currentUser.userId, id);

    return successResponse(null, 'Session revoked successfully', {});
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Other sessions revoked successfully' })
  async revokeOthers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() refreshTokenDto: RefreshTokenDto,
  ) {
    const data = await this.sessionsService.revokeOtherSessions(
      currentUser.userId,
      refreshTokenDto.refreshToken,
    );

    return successResponse(data, 'Other sessions revoked successfully', {});
  }
}
