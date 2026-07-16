import { PrismaService } from '../prisma/prisma.service';

/**
 * Revokes every active (non-revoked) refresh token for a user - the shared
 * "log out everywhere" step after a password change, whether triggered via
 * the authenticated change-password flow or the forgot-password OTP reset.
 * A single implementation so both call sites can never drift.
 */
export async function revokeAllRefreshTokens(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
