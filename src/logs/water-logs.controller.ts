import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { CreateWaterLogDto } from './dto/create-water-log.dto';
import { ListWaterLogsQueryDto } from './dto/list-water-logs-query.dto';
import { WaterLogsService } from './water-logs.service';

@ApiTags('Water Logs')
@Controller('logs/water')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WaterLogsController {
  constructor(private readonly waterLogsService: WaterLogsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListWaterLogsQueryDto,
  ) {
    const data = await this.waterLogsService.findMany(
      currentUser.userId,
      query,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post()
  @ApiCreatedResponse({ description: 'Water logged successfully' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() createWaterLogDto: CreateWaterLogDto,
  ) {
    const data = await this.waterLogsService.create(
      currentUser.userId,
      createWaterLogDto,
    );

    return successResponse(data, 'Water logged successfully', {});
  }
}
