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
import { CreateWeightLogDto } from './dto/create-weight-log.dto';
import { ListWeightLogsQueryDto } from './dto/list-weight-logs-query.dto';
import { WeightLogsService } from './weight-logs.service';

@ApiTags('Weight Logs')
@Controller('logs/weight')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WeightLogsController {
  constructor(private readonly weightLogsService: WeightLogsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListWeightLogsQueryDto,
  ) {
    const data = await this.weightLogsService.findMany(
      currentUser.userId,
      query,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post()
  @ApiCreatedResponse({ description: 'Weight logged successfully' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() createWeightLogDto: CreateWeightLogDto,
  ) {
    const data = await this.weightLogsService.create(
      currentUser.userId,
      createWeightLogDto,
    );

    return successResponse(data, 'Weight logged successfully', {});
  }
}
