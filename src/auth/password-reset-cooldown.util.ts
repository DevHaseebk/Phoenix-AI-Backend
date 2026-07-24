/**
 * Escalating resend-cooldown for the forgot-password OTP flow. Pure
 * functions, no DB access, so cooldown-tier logic is unit-testable without
 * mocking Prisma. Consumed by password-reset.service.ts.
 */

/**
 * A request is considered part of a fresh sequence (requestCount treated as
 * 0) once this much time has passed since the last request - a user coming
 * back "the next day" or after a long gap starts at tier 1, not wherever
 * they left off. 30 minutes: long enough that a legitimate user who steps
 * away to check their email/gets distracted mid-flow doesn't get bumped back
 * to tier 1, short enough that a genuinely new attempt (later that day, or
 * the next day) always starts fresh rather than inheriting a stale tier.
 */
export const PASSWORD_RESET_STALENESS_MS = 30 * 60 * 1000;

/**
 * Cooldown required before request number `requestNumber` (1-based) may be
 * sent, counted from the previous request's timestamp. 1st request: none.
 * 2nd: 1 min. 3rd: 2 min. 4th: 5 min. 5th+: 10 min (capped, does not keep
 * growing).
 */
export function getRequiredCooldownMs(requestNumber: number): number {
  if (requestNumber <= 1) {
    return 0;
  }
  if (requestNumber === 2) {
    return 60 * 1000;
  }
  if (requestNumber === 3) {
    return 2 * 60 * 1000;
  }
  if (requestNumber === 4) {
    return 5 * 60 * 1000;
  }
  return 10 * 60 * 1000;
}

export interface PasswordResetCooldownState {
  requestCount: number;
  lastRequestedAt: Date | null;
}

export interface PasswordResetCooldownDecision {
  /** Whether a new OTP may be sent right now. */
  allowed: boolean;
  /**
   * If allowed: seconds until the *next* resend would require waiting.
   * If denied: seconds remaining on the currently active cooldown.
   */
  retryAfterSeconds: number;
  /** requestCount to treat as the base for this decision (0 if stale). */
  effectiveRequestCount: number;
}

export function evaluatePasswordResetCooldown(
  state: PasswordResetCooldownState,
  now: number,
): PasswordResetCooldownDecision {
  const isStale =
    state.lastRequestedAt !== null &&
    now - state.lastRequestedAt.getTime() > PASSWORD_RESET_STALENESS_MS;
  const effectiveRequestCount = isStale ? 0 : state.requestCount;

  if (effectiveRequestCount > 0 && state.lastRequestedAt !== null) {
    const elapsedMs = now - state.lastRequestedAt.getTime();
    const requiredMs = getRequiredCooldownMs(effectiveRequestCount + 1);

    if (elapsedMs < requiredMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((requiredMs - elapsedMs) / 1000),
        effectiveRequestCount,
      };
    }
  }

  const nextRequiredMs = getRequiredCooldownMs(effectiveRequestCount + 2);

  return {
    allowed: true,
    retryAfterSeconds: Math.ceil(nextRequiredMs / 1000),
    effectiveRequestCount,
  };
}
