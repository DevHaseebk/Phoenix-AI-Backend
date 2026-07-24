import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAiProvider } from '../ai/ai-provider-resolution.util';
import { recentErrorTracker } from '../common/utils/recent-error-tracker';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminSystemHealth {
  ai: {
    aiEnabled: boolean;
    configuredProvider: 'gemini' | 'local';
    geminiKeyConfigured: boolean;
    effectiveProvider: 'gemini' | 'local';
  };
  database: {
    connected: boolean;
  };
  recentErrors: {
    /** Best-effort, in-process only - see recent-error-tracker.ts's own
     * doc comment for exactly what this does and doesn't cover. */
    last24Hours: number;
    limitation: string;
  };
  checkedAt: string;
}

const RECENT_ERRORS_LIMITATION =
  'Best-effort count of 5xx responses this server process has handled in ' +
  'the last 24 hours - no centralized logging/Sentry exists in this repo, ' +
  'so this resets on every restart and only reflects this one process, ' +
  'not a real log-aggregation system.';

/**
 * Read-only System Health for the admin panel - AI configuration status
 * (never the key value itself), DB connectivity (reuses the same
 * PrismaService.readinessCheck() the public /health endpoint already uses,
 * not a second implementation), and a best-effort recent-error count.
 */
@Injectable()
export class AdminSystemHealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getHealth(now = new Date()): Promise<AdminSystemHealth> {
    const {
      aiEnabled,
      configuredProvider,
      geminiKeyConfigured,
      effectiveProvider,
    } = resolveAiProvider(this.config);
    const databaseConnected = await this.prisma.readinessCheck();

    return {
      ai: {
        aiEnabled,
        configuredProvider,
        geminiKeyConfigured,
        effectiveProvider,
      },
      database: { connected: databaseConnected },
      recentErrors: {
        last24Hours: recentErrorTracker.countLast24Hours(now.getTime()),
        limitation: RECENT_ERRORS_LIMITATION,
      },
      checkedAt: now.toISOString(),
    };
  }
}
