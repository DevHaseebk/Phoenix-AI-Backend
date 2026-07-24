const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Best-effort, in-process 5xx counter for System Health - not a real
 * log-aggregation store (no Sentry/centralized logging exists in this repo,
 * per docs/16_Claude_Code_Handover.md). Known limitations, documented
 * rather than silently glossed over: resets on every server restart/deploy,
 * only reflects the single process it runs in (irrelevant today since this
 * app runs as one instance, but wouldn't aggregate across replicas), and
 * only counts errors GlobalExceptionFilter actually saw (nothing outside
 * NestJS's own request/response cycle, e.g. no bootstrap failures).
 */
export class RecentErrorTracker {
  private timestampsMs: number[] = [];

  record(nowMs: number = Date.now()): void {
    this.timestampsMs.push(nowMs);
    this.prune(nowMs);
  }

  countLast24Hours(nowMs: number = Date.now()): number {
    this.prune(nowMs);

    return this.timestampsMs.length;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - WINDOW_MS;

    this.timestampsMs = this.timestampsMs.filter((ts) => ts >= cutoff);
  }
}

/** Single shared instance - GlobalExceptionFilter (manually instantiated in
 * main.ts, outside Nest DI) and AdminSystemHealthService (a real Nest
 * provider) both need the same counter, so a module-level singleton is
 * simpler than threading DI through main.ts's `new GlobalExceptionFilter()`
 * call. */
export const recentErrorTracker = new RecentErrorTracker();
