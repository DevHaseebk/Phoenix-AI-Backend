import { RecentErrorTracker } from './recent-error-tracker';

describe('RecentErrorTracker', () => {
  it('counts errors recorded within the last 24 hours', () => {
    const tracker = new RecentErrorTracker();
    const now = new Date('2026-07-21T12:00:00.000Z').getTime();

    tracker.record(now - 60 * 60 * 1000); // 1h ago
    tracker.record(now - 12 * 60 * 60 * 1000); // 12h ago
    tracker.record(now - 23 * 60 * 60 * 1000); // 23h ago

    expect(tracker.countLast24Hours(now)).toBe(3);
  });

  it('excludes errors older than 24 hours', () => {
    const tracker = new RecentErrorTracker();
    const now = new Date('2026-07-21T12:00:00.000Z').getTime();

    tracker.record(now - 25 * 60 * 60 * 1000); // 25h ago - excluded
    tracker.record(now - 1 * 60 * 60 * 1000); // 1h ago - included

    expect(tracker.countLast24Hours(now)).toBe(1);
  });

  it('returns 0 when nothing has been recorded', () => {
    const tracker = new RecentErrorTracker();

    expect(tracker.countLast24Hours()).toBe(0);
  });

  it('prunes stale entries so the internal array does not grow unbounded', () => {
    const tracker = new RecentErrorTracker();
    const now = new Date('2026-07-21T12:00:00.000Z').getTime();

    tracker.record(now - 30 * 60 * 60 * 1000); // stale
    tracker.countLast24Hours(now); // triggers a prune

    tracker.record(now); // fresh
    expect(tracker.countLast24Hours(now)).toBe(1);
  });
});
