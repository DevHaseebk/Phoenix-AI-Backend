import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { successResponse } from '../common/responses/response.helper';
import { AdminGoldenTestsService } from './admin-golden-tests.service';
import { RunGoldenTestsDto } from './dto/run-golden-tests.dto';

@ApiTags('Admin - Golden Tests')
@Controller('admin/golden-tests')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminGoldenTestsController {
  constructor(
    private readonly adminGoldenTestsService: AdminGoldenTestsService,
  ) {}

  @Post('run')
  @ApiOkResponse({ description: 'Golden test run started' })
  run(
    @Body() dto: RunGoldenTestsDto,
    @CurrentUser() adminUser: AuthenticatedUser,
  ) {
    // Belt-and-suspenders: the frontend already requires an explicit
    // confirm click before this request is ever sent, but a real API
    // consumer (curl, a script) gets the same guardrail server-side - this
    // spends real Gemini quota per docs' quota-discipline principle.
    if (dto.confirm !== true) {
      throw new BadRequestException(
        'confirm must be explicitly true to start a golden test run',
      );
    }

    const job = this.adminGoldenTestsService.startRun(adminUser.userId);

    return successResponse(job, 'Golden test run started', {});
  }

  @Get('status/:jobId')
  @ApiOkResponse({ description: 'Fetched successfully' })
  getStatus(@Param('jobId') jobId: string) {
    const job = this.adminGoldenTestsService.getJob(jobId);

    if (!job) {
      throw new NotFoundException('Golden test job not found');
    }

    return successResponse(job, 'Fetched successfully', {});
  }
}
