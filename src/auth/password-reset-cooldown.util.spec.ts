import {
  PASSWORD_RESET_STALENESS_MS,
  evaluatePasswordResetCooldown,
  getRequiredCooldownMs,
} from './password-reset-cooldown.util';

describe('password-reset-cooldown.util', () => {
  describe('getRequiredCooldownMs', () => {
    it('requires no cooldown before the 1st request', () => {
      expect(getRequiredCooldownMs(1)).toBe(0);
    });

    it('requires 1 minute before the 2nd request', () => {
      expect(getRequiredCooldownMs(2)).toBe(60 * 1000);
    });

    it('requires 2 minutes before the 3rd request', () => {
      expect(getRequiredCooldownMs(3)).toBe(2 * 60 * 1000);
    });

    it('requires 5 minutes before the 4th request', () => {
      expect(getRequiredCooldownMs(4)).toBe(5 * 60 * 1000);
    });

    it('requires 10 minutes before the 5th request', () => {
      expect(getRequiredCooldownMs(5)).toBe(10 * 60 * 1000);
    });

    it('caps at 10 minutes for the 6th+ request (does not keep growing)', () => {
      expect(getRequiredCooldownMs(6)).toBe(10 * 60 * 1000);
      expect(getRequiredCooldownMs(50)).toBe(10 * 60 * 1000);
    });
  });

  describe('evaluatePasswordResetCooldown', () => {
    const now = 1_000_000_000_000;

    it('allows a brand-new request (no prior history) with a 60s next-resend hint', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 0, lastRequestedAt: null },
        now,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.effectiveRequestCount).toBe(0);
      expect(decision.retryAfterSeconds).toBe(60);
    });

    it('denies the 2nd request before 1 minute has elapsed', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 1, lastRequestedAt: new Date(now - 30_000) },
        now,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBe(30);
    });

    it('allows the 2nd request exactly at 1 minute, hinting a 2 min next cooldown', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 1, lastRequestedAt: new Date(now - 60_000) },
        now,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.effectiveRequestCount).toBe(1);
      expect(decision.retryAfterSeconds).toBe(120);
    });

    it('denies the 3rd request before 2 minutes have elapsed', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 2, lastRequestedAt: new Date(now - 60_000) },
        now,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBe(60);
    });

    it('denies the 5th+ request before the capped 10 minutes have elapsed', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 5, lastRequestedAt: new Date(now - 5 * 60_000) },
        now,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBe(5 * 60);
    });

    it('allows the 6th request once the capped 10 minutes have elapsed, still capped for the next hint', () => {
      const decision = evaluatePasswordResetCooldown(
        { requestCount: 5, lastRequestedAt: new Date(now - 10 * 60_000) },
        now,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.retryAfterSeconds).toBe(10 * 60);
    });

    it('treats a stale lastRequestedAt (past the staleness window) as a fresh sequence', () => {
      const decision = evaluatePasswordResetCooldown(
        {
          requestCount: 5,
          lastRequestedAt: new Date(now - PASSWORD_RESET_STALENESS_MS - 1_000),
        },
        now,
      );

      expect(decision.allowed).toBe(true);
      expect(decision.effectiveRequestCount).toBe(0);
      expect(decision.retryAfterSeconds).toBe(60);
    });

    it('does not treat a request just inside the staleness window as fresh', () => {
      // Cooldown tiers cap at 10 min, well under the 30 min staleness
      // window, so `allowed` alone can't distinguish "not stale" from
      // "stale" here - both would already be past their tiny cooldown.
      // effectiveRequestCount is the direct signal for staleness itself.
      const decision = evaluatePasswordResetCooldown(
        {
          requestCount: 5,
          lastRequestedAt: new Date(now - PASSWORD_RESET_STALENESS_MS + 1_000),
        },
        now,
      );

      expect(decision.effectiveRequestCount).toBe(5);
    });
  });
});
