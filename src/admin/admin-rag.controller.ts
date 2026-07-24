import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { successResponse } from '../common/responses/response.helper';
import { AdminRagService } from './admin-rag.service';
import { UpdateAdminRagDocumentDto } from './dto/update-admin-rag-document.dto';

@ApiTags('Admin - RAG Content')
@Controller('admin/rag-documents')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminRagController {
  constructor(private readonly adminRagService: AdminRagService) {}

  @Get()
  @ApiOkResponse({ description: 'Fetched successfully' })
  async list() {
    const data = await this.adminRagService.list();

    return successResponse(data, 'Fetched successfully', {});
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Fetched successfully' })
  async getById(@Param('id') id: string) {
    const data = await this.adminRagService.getById(id);

    return successResponse(data, 'Fetched successfully', {});
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Document updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminRagDocumentDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    if (dto.title === undefined && dto.content === undefined) {
      throw new BadRequestException('At least one field is required');
    }

    const data = await this.adminRagService.update(id, dto, adminUser.userId);

    return successResponse(data, 'Document updated successfully', {});
  }

  @Patch(':id/approve')
  @ApiOkResponse({ description: 'Document approved' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.adminRagService.approve(id, adminUser.userId);

    return successResponse(data, 'Document approved', {});
  }

  @Patch(':id/unapprove')
  @ApiOkResponse({ description: 'Document set back to draft' })
  async unapprove(
    @Param('id') id: string,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    const data = await this.adminRagService.unapprove(id, adminUser.userId);

    return successResponse(data, 'Document set back to draft', {});
  }
}
