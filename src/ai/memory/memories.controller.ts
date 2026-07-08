import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { successResponse } from '../../common/responses/response.helper';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';

@ApiTags('AI Memories')
@Controller('me/memories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MemoriesController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async findMany(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.memoryService.listVisibleMemories(
      currentUser.userId,
    );

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Memory updated successfully' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateMemoryDto: UpdateMemoryDto,
  ) {
    const data = await this.memoryService.updateMemoryContent(
      currentUser.userId,
      id,
      updateMemoryDto.content,
    );

    return successResponse(data, 'Memory updated successfully', {});
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Memory deleted successfully' })
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.memoryService.archiveMemory(currentUser.userId, id);

    return successResponse(null, 'Memory deleted successfully', {});
  }
}
