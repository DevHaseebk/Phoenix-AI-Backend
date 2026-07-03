import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../common/responses/response.helper';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOkResponse({ description: 'API health status' })
  check() {
    return successResponse(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.config.getOrThrow<string>('NODE_ENV'),
      },
      'API is healthy',
    );
  }
}
