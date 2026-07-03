import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../common/responses/response.helper';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'API health status' })
  async check() {
    const databaseConnected = await this.prisma.readinessCheck();

    return successResponse(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.config.getOrThrow<string>('NODE_ENV'),
        database: {
          connected: databaseConnected,
        },
      },
      'API is healthy',
    );
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Prisma readiness status' })
  async readiness() {
    const databaseConnected = await this.prisma.readinessCheck();

    return successResponse(
      {
        database: {
          connected: databaseConnected,
        },
      },
      databaseConnected
        ? 'Service dependencies ready'
        : 'Service dependencies not ready',
    );
  }
}
