import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { EditFoodItemDto } from '../ai/food/dto/edit-food-item.dto';
import { FoodItemsService } from '../ai/food/food-items.service';
import { BulkApproveFoodItemsDto } from './dto/bulk-approve-food-items.dto';
import { ListAdminFoodItemsQueryDto } from './dto/list-admin-food-items-query.dto';

@ApiTags('Admin - Food Database')
@Controller('admin/food-items')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminFoodItemsController {
  constructor(private readonly foodItemsService: FoodItemsService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list(@Query() query: ListAdminFoodItemsQueryDto) {
    const data = await this.foodItemsService.listForReview(query);

    return successResponse(data, 'Fetched successfully', {});
  }

  // Declared before the ':id' route below so "bulk-approve" is never
  // swallowed as a path param.
  @Patch('bulk-approve')
  @ApiOkResponse({ description: 'Food items approved' })
  async bulkApprove(
    @Body() dto: BulkApproveFoodItemsDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.foodItemsService.bulkApprove(
      dto.ids,
      adminUser.userId,
    );

    return successResponse(data, 'Food items approved', {});
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Food item updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: EditFoodItemDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.foodItemsService.reviewUpdate(
      id,
      dto,
      adminUser.userId,
    );

    return successResponse(data, 'Food item updated successfully', {});
  }
}
