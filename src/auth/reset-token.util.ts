import { createHash, randomBytes } from 'node:crypto';

/** Raw single-use reset token issued on successful OTP verification. */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a raw reset token before storing/comparing it - never the raw
 * token (PasswordResetOtp.resetTokenHash is never plain). SHA-256, not
 * argon2: the token itself already carries 256 bits of random entropy
 * (unlike a 6-digit OTP), so a slow hash buys no meaningful protection
 * against brute force and would only slow down every lookup - same
 * reasoning as refresh-token-hash.util.ts's hashRefreshToken().
 */
export function hashResetToken(resetToken: string): string {
  return createHash('sha256').update(resetToken).digest('hex');
}
