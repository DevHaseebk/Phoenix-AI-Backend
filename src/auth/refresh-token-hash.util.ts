import { createHash } from 'node:crypto';

/**
 * Single source of truth for hashing a raw refresh token before storing/
 * comparing it (RefreshToken.tokenHash is never the raw token). Shared by
 * AuthService (issuing/verifying/revoking sessions) and SessionsService
 * (matching a client-supplied "current" refresh token against stored hashes)
 * so the two can never drift into incompatible hashing.
 */
export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}
