import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('development'),
  } as unknown as ConfigService;
  const readinessCheck = jest.fn<Promise<boolean>, []>();
  const prisma = {
    readinessCheck,
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard health response', async () => {
    readinessCheck.mockResolvedValue(true);
    const controller = new HealthController(config, prisma);

    const response = await controller.check();

    expect(response.success).toBe(true);
    expect(response.message).toBe('API is healthy');
    expect(response.data.status).toBe('ok');
    expect(response.data.environment).toBe('development');
    expect(response.data.database.connected).toBe(true);
    expect(typeof response.data.timestamp).toBe('string');
    expect(typeof response.data.uptime).toBe('number');
  });

  it('returns Prisma readiness response', async () => {
    readinessCheck.mockResolvedValue(true);
    const controller = new HealthController(config, prisma);

    const response = await controller.readiness();

    expect(response.success).toBe(true);
    expect(response.message).toBe('Service dependencies ready');
    expect(response.data.database.connected).toBe(true);
  });
});
