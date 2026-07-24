import { ConfigService } from '@nestjs/config';
import { recentErrorTracker } from '../common/utils/recent-error-tracker';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSystemHealthService } from './admin-system-health.service';

describe('AdminSystemHealthService', () => {
  const readinessCheck = jest.fn();
  const prisma = { readinessCheck } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    // recentErrorTracker is a module-level singleton - clear it between
    // tests by pruning everything via a far-future "now".
    recentErrorTracker.countLast24Hours(Date.now() + 1000 * 60 * 60 * 24 * 365);
  });

  function makeConfig(
    values: Record<string, string | undefined>,
  ): ConfigService {
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }

  it('reports effectiveProvider: gemini when enabled with a key configured', async () => {
    const config = makeConfig({ GEMINI_API_KEY: 'real-key' });
    readinessCheck.mockResolvedValue(true);
    const service = new AdminSystemHealthService(config, prisma);

    const health = await service.getHealth();

    expect(health.ai).toEqual({
      aiEnabled: true,
      configuredProvider: 'gemini',
      geminiKeyConfigured: true,
      effectiveProvider: 'gemini',
    });
  });

  it('never includes the actual GEMINI_API_KEY value anywhere in the response', async () => {
    const config = makeConfig({ GEMINI_API_KEY: 'super-secret-value' });
    readinessCheck.mockResolvedValue(true);
    const service = new AdminSystemHealthService(config, prisma);

    const health = await service.getHealth();

    expect(JSON.stringify(health)).not.toContain('super-secret-value');
  });

  it('reports effectiveProvider: local when AI_ENABLED=false', async () => {
    const config = makeConfig({
      AI_ENABLED: 'false',
      GEMINI_API_KEY: 'real-key',
    });
    readinessCheck.mockResolvedValue(true);
    const service = new AdminSystemHealthService(config, prisma);

    const health = await service.getHealth();

    expect(health.ai.effectiveProvider).toBe('local');
  });

  it('reflects real DB connectivity via PrismaService.readinessCheck()', async () => {
    const config = makeConfig({});
    readinessCheck.mockResolvedValue(false);
    const service = new AdminSystemHealthService(config, prisma);

    const health = await service.getHealth();

    expect(health.database.connected).toBe(false);
    expect(readinessCheck).toHaveBeenCalled();
  });

  it('counts recent errors via the shared recentErrorTracker singleton', async () => {
    const config = makeConfig({});
    readinessCheck.mockResolvedValue(true);
    const now = new Date('2026-07-21T12:00:00.000Z');
    recentErrorTracker.record(now.getTime() - 60 * 60 * 1000);
    recentErrorTracker.record(now.getTime() - 2 * 60 * 60 * 1000);
    const service = new AdminSystemHealthService(config, prisma);

    const health = await service.getHealth(now);

    expect(health.recentErrors.last24Hours).toBe(2);
    expect(health.recentErrors.limitation).toContain('Best-effort');
  });
});
