import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns standard health response', () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('development'),
    } as unknown as ConfigService;
    const controller = new HealthController(config);

    const response = controller.check();

    expect(response.success).toBe(true);
    expect(response.message).toBe('API is healthy');
    expect(response.data.status).toBe('ok');
    expect(response.data.environment).toBe('development');
    expect(typeof response.data.timestamp).toBe('string');
    expect(typeof response.data.uptime).toBe('number');
  });
});
