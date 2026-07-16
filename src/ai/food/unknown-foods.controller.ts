import {
  BadRequestException,
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
import { AdminGuard } from '../../auth/guards/admin.guard';
import { successResponse } from '../../common/responses/response.helper';
import { ApproveUnknownFoodDto } from './dto/approve-unknown-food.dto';
import { EditFoodItemDto } from './dto/edit-food-item.dto';
import { ListUnknownFoodsQueryDto } from './dto/list-unknown-foods-query.dto';
import { FoodItemsService } from './food-items.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';

// Founder/operator-facing (Unknown Food Queue review). Previously gated by
// plain JwtAuthGuard only (an accepted, documented gap) - re-secured behind
// AdminGuard (Admin Panel Prompt #5, 2026-07-16) now that real admin auth
// exists. The review UI itself moved from frontend/app/internal/unknown-foods
// into admin/ in the same task; see docs/16_Claude_Code_Handover.md §6.
@ApiTags('Admin - Unknown Food Queue')
@Controller('internal/unknown-foods')
@UseGuards(AdminGuard)
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
      foodItem.id,
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

  /**
   * Edits the nutrition values of the FoodItem an APPROVED queue item is
   * linked to - never re-runs approval, never touches the queue item's own
   * fields beyond what setStatus() already covers elsewhere. Only callable
   * once a linkedFoodItemId actually exists (i.e. after a real approve()),
   * so this can't be used to sneak a food item into existence some other way.
   */
  @Patch(':id/edit-food-item')
  @ApiOkResponse({ description: 'Food item updated successfully' })
  async editFoodItem(@Param('id') id: string, @Body() dto: EditFoodItemDto) {
    if (
      dto.caloriesPer100g === undefined &&
      dto.proteinPer100g === undefined &&
      dto.carbsPer100g === undefined &&
      dto.fatPer100g === undefined &&
      dto.defaultServingGrams === undefined
    ) {
      throw new BadRequestException('At least one field is required');
    }

    const queueItem = await this.unknownFoodQueueService.findById(id);

    if (!queueItem) {
      throw new NotFoundException('Unknown food queue item not found');
    }

    if (
      queueItem.status !== UnknownFoodQueueStatus.APPROVED ||
      !queueItem.linkedFoodItemId
    ) {
      throw new BadRequestException(
        'Only an approved queue item with a linked food item can be edited',
      );
    }

    const foodItem = await this.foodItemsService.update(
      queueItem.linkedFoodItemId,
      dto,
    );

    return successResponse(foodItem, 'Food item updated successfully', {});
  }

  /**
   * Undoes a REJECTED or NEEDS_RESEARCH classification, moving the item back
   * to PENDING. Deliberately refuses on an APPROVED item - a real FoodItem
   * already exists by then, and "restoring" it to pending would desync the
   * queue item's status from that fact; edit-food-item is the correct action
   * once approved.
   */
  @Patch(':id/restore-to-pending')
  @ApiOkResponse({ description: 'Queue item restored to pending' })
  async restoreToPending(@Param('id') id: string) {
    const queueItem = await this.unknownFoodQueueService.findById(id);

    if (!queueItem) {
      throw new NotFoundException('Unknown food queue item not found');
    }

    if (queueItem.status === UnknownFoodQueueStatus.APPROVED) {
      throw new BadRequestException(
        'An approved item cannot be restored to pending - edit its linked food item instead',
      );
    }

    const updated = await this.unknownFoodQueueService.setStatus(
      id,
      UnknownFoodQueueStatus.PENDING,
    );

    return successResponse(updated, 'Queue item restored to pending', {});
  }
}
