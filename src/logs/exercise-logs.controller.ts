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
import { CreateExerciseLogDto } from './dto/create-exercise-log.dto';
import { ListExerciseLogsQueryDto } from './dto/list-exercise-logs-query.dto';
import { ExerciseLogsService } from './exercise-logs.service';

@ApiTags('Exercise Logs')
@Controller('logs/exercise')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExerciseLogsController {
  constructor(private readonly exerciseLogsService: ExerciseLogsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListExerciseLogsQueryDto,
  ) {
    const data = await this.exerciseLogsService.findMany(
      currentUser.userId,
      query,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post()
  @ApiCreatedResponse({ description: 'Exercise logged successfully' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() createExerciseLogDto: CreateExerciseLogDto,
  ) {
    const data = await this.exerciseLogsService.create(
      currentUser.userId,
      createExerciseLogDto,
    );

    return successResponse(data, 'Exercise logged successfully', {});
  }
}
