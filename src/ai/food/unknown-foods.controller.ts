import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UnknownFoodQueueStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { successResponse } from '../../common/responses/response.helper';
import { ApproveUnknownFoodDto } from './dto/approve-unknown-food.dto';
import { ListUnknownFoodsQueryDto } from './dto/list-unknown-foods-query.dto';
import { FoodItemsService } from './food-items.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';

// NOTE (security gap, documented per task instructions): these endpoints are
// founder/operator-facing (Unknown Food Queue review), not user-facing, but
// this project has no admin-role/permission system yet (admin/ is an
// unimplemented skeleton). They are gated behind plain JwtAuthGuard only, so
// any authenticated user can technically reach them via a direct API call.
// This is an accepted, known-for-now gap - flagged here for a real fix once
// proper admin auth exists. Do not build role-based access control in this
// task; that is explicitly out of scope.
@ApiTags('Internal - Unknown Food Queue')
@Controller('internal/unknown-foods')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UnknownFoodsController {
  constructor(
    private readonly unknownFoodQueueService: UnknownFoodQueueService,
    private readonly foodItemsService: FoodItemsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListUnknownFoodsQueryDto) {
    const data = await this.unknownFoodQueueService.list(query.status);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id/approve')
  @ApiOkResponse({ description: 'Food item created and queue item approved' })
  async approve(@Param('id') id: string, @Body() dto: ApproveUnknownFoodDto) {
    const queueItem = await this.unknownFoodQueueService.findById(id);

    if (!queueItem) {
      throw new NotFoundException('Unknown food queue item not found');
    }

    const foodItem = await this.foodItemsService.create({
      name: dto.name,
      category: dto.category,
      caloriesPer100g: dto.caloriesPer100g,
      proteinPer100g: dto.proteinPer100g,
      carbsPer100g: dto.carbsPer100g,
      fatPer100g: dto.fatPer100g,
      defaultServingDescription: dto.defaultServingDescription,
      defaultServingGrams: dto.defaultServingGrams,
      confidence: 'MEDIUM',
      source: 'FOUNDER_REVIEWED',
      verified: true,
      aliases: [...(dto.aliases ?? []), queueItem.rawText],
    });

    const updatedQueueItem = await this.unknownFoodQueueService.setStatus(
      id,
      UnknownFoodQueueStatus.APPROVED,
    );

    return successResponse(
      { foodItem, queueItem: updatedQueueItem },
      'Food item created and queue item approved',
      {},
    );
  }

  @Patch(':id/reject')
  @ApiOkResponse({ description: 'Queue item rejected' })
  async reject(@Param('id') id: string) {
    const updated = await this.unknownFoodQueueService.setStatus(
      id,
      UnknownFoodQueueStatus.REJECTED,
    );

    if (!updated) {
      throw new NotFoundException('Unknown food queue item not found');
    }

    return successResponse(updated, 'Queue item rejected', {});
  }

  @Patch(':id/needs-research')
  @ApiOkResponse({ description: 'Queue item marked as needing research' })
  async needsResearch(@Param('id') id: string) {
    const updated = await this.unknownFoodQueueService.setStatus(
      id,
      UnknownFoodQueueStatus.NEEDS_RESEARCH,
    );

    if (!updated) {
      throw new NotFoundException('Unknown food queue item not found');
    }

    return successResponse(
      updated,
      'Queue item marked as needing research',
      {},
    );
  }
}
