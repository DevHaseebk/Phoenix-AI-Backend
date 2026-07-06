import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CreateMealLogDto } from './dto/create-meal-log.dto';
import { ListMealLogsQueryDto } from './dto/list-meal-logs-query.dto';
import { UpdateMealLogDto } from './dto/update-meal-log.dto';
import { MealLogsService } from './meal-logs.service';

@ApiTags('Meal Logs')
@Controller('logs/meals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MealLogsController {
  constructor(private readonly mealLogsService: MealLogsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListMealLogsQueryDto,
  ) {
    const data = await this.mealLogsService.findMany(currentUser.userId, query);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const data = await this.mealLogsService.findOne(currentUser.userId, id);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Post()
  @ApiCreatedResponse({ description: 'Meal logged successfully' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() createMealLogDto: CreateMealLogDto,
  ) {
    const data = await this.mealLogsService.create(
      currentUser.userId,
      createMealLogDto,
    );

    return successResponse(data, 'Meal logged successfully', {});
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Meal updated successfully' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateMealLogDto: UpdateMealLogDto,
  ) {
    const data = await this.mealLogsService.update(
      currentUser.userId,
      id,
      updateMealLogDto,
    );

    return successResponse(data, 'Meal updated successfully', {});
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Meal deleted successfully' })
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.mealLogsService.remove(currentUser.userId, id);

    return successResponse(null, 'Meal deleted successfully', {});
  }
}
