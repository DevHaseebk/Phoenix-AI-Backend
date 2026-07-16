import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

/** Generates a 6-digit numeric OTP, zero-padded (e.g. "042913"). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Hashes an OTP the same way User.passwordHash is hashed - never stored plain. */
export async function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, { type: argon2.argon2id });
}

export async function verifyOtp(
  otpHash: string,
  otp: string,
): Promise<boolean> {
  return argon2.verify(otpHash, otp);
}
