import { AdminSystemHealthController } from './admin-system-health.controller';
import { AdminSystemHealthService } from './admin-system-health.service';

describe('AdminSystemHealthController', () => {
  const getHealth = jest.fn();
  const adminSystemHealthService = {
    getHealth,
  } as unknown as AdminSystemHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps the service result', async () => {
    const health = {
      ai: {
        aiEnabled: true,
        configuredProvider: 'gemini',
        geminiKeyConfigured: true,
        effectiveProvider: 'gemini',
      },
      database: { connected: true },
      recentErrors: { last24Hours: 0, limitation: 'Best-effort...' },
      checkedAt: '2026-07-21T12:00:00.000Z',
    };
    getHealth.mockResolvedValue(health);
    const controller = new AdminSystemHealthController(
      adminSystemHealthService,
    );

    const response = await controller.getHealth();

    expect(response.data).toEqual(health);
  });
});
