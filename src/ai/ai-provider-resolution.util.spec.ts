import { ConfigService } from '@nestjs/config';
import { resolveAiProvider } from './ai-provider-resolution.util';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('resolveAiProvider', () => {
  it('resolves to gemini when enabled, provider unset (defaults to gemini), and a key is configured', () => {
    const resolution = resolveAiProvider(
      makeConfig({ GEMINI_API_KEY: 'real-key' }),
    );

    expect(resolution).toEqual({
      aiEnabled: true,
      configuredProvider: 'gemini',
      geminiKeyConfigured: true,
      effectiveProvider: 'gemini',
    });
  });

  it('resolves to local when AI_ENABLED=false, even with a key configured', () => {
    const resolution = resolveAiProvider(
      makeConfig({ AI_ENABLED: 'false', GEMINI_API_KEY: 'real-key' }),
    );

    expect(resolution.aiEnabled).toBe(false);
    expect(resolution.effectiveProvider).toBe('local');
  });

  it('resolves to local when AI_PROVIDER=local, even with a key configured', () => {
    const resolution = resolveAiProvider(
      makeConfig({ AI_PROVIDER: 'local', GEMINI_API_KEY: 'real-key' }),
    );

    expect(resolution.configuredProvider).toBe('local');
    expect(resolution.effectiveProvider).toBe('local');
  });

  it('resolves to local when no GEMINI_API_KEY is configured', () => {
    const resolution = resolveAiProvider(makeConfig({}));

    expect(resolution.geminiKeyConfigured).toBe(false);
    expect(resolution.effectiveProvider).toBe('local');
  });

  it('never includes the actual key value, only a boolean', () => {
    const resolution = resolveAiProvider(
      makeConfig({ GEMINI_API_KEY: 'super-secret-value' }),
    );

    expect(JSON.stringify(resolution)).not.toContain('super-secret-value');
  });
});
