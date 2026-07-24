import { ConfigService } from '@nestjs/config';

export type AiProviderKind = 'gemini' | 'local';

export interface AiProviderResolution {
  /** AI_ENABLED, defaulting to true when unset (matches env.validation.ts). */
  aiEnabled: boolean;
  /** AI_PROVIDER as configured, defaulting to 'gemini' (matches env.validation.ts). */
  configuredProvider: AiProviderKind;
  /** Whether GEMINI_API_KEY is set - never the key value itself. */
  geminiKeyConfigured: boolean;
  /** What AiModule's AI_PROVIDER factory actually instantiates given all three
   * factors above - the single source of truth both the factory and
   * AdminSystemHealthService read from, so they can never drift apart. */
  effectiveProvider: AiProviderKind;
}

/** Pure function extracted from AiModule's AI_PROVIDER factory so
 * admin-system-health.service.ts can report the exact same effective
 * provider a real chat/estimate request would use, without duplicating (and
 * risking drifting from) the factory's own if/else. */
export function resolveAiProvider(config: ConfigService): AiProviderResolution {
  const aiEnabled = config.get<string>('AI_ENABLED') !== 'false';
  const configuredProvider =
    (config.get<string>('AI_PROVIDER') as AiProviderKind | undefined) ??
    'gemini';
  const geminiKeyConfigured = Boolean(config.get<string>('GEMINI_API_KEY'));

  const effectiveProvider: AiProviderKind =
    !aiEnabled || configuredProvider === 'local' || !geminiKeyConfigured
      ? 'local'
      : 'gemini';

  return {
    aiEnabled,
    configuredProvider,
    geminiKeyConfigured,
    effectiveProvider,
  };
}
