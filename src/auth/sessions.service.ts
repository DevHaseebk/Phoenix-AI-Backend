import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken } from './refresh-token-hash.util';

export interface SessionResponse {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  isCurrent: boolean;
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * currentRefreshToken is optional client context (sent as a header, never
   * a query param, to avoid a secret token landing in server/proxy access
   * logs) used only to flag which row is "this session" - the access token
   * alone can't tell us that, since nothing links an access token back to
   * the refresh token that spawned it.
   */
  async listSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<SessionResponse[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        deviceName: true,
        deviceType: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    const currentHash = currentRefreshToken
      ? hashRefreshToken(currentRefreshToken)
      : null;

    return rows.map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      deviceType: row.deviceType,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      isCurrent: currentHash !== null && row.tokenHash === currentHash,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, revokedAt: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.revokedAt !== null) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
      select: { id: true },
    });
  }

  async revokeOtherSessions(
    userId: string,
    currentRefreshToken: string,
  ): Promise<{ revokedCount: number }> {
    const currentHash = hashRefreshToken(currentRefreshToken);
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, tokenHash: { not: currentHash } },
      data: { revokedAt: new Date() },
    });

    return { revokedCount: result.count };
  }
}
