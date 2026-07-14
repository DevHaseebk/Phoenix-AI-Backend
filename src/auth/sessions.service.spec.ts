import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken } from './refresh-token-hash.util';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const refreshTokenFindMany = jest.fn();
  const refreshTokenFindFirst = jest.fn();
  const refreshTokenUpdate = jest.fn();
  const refreshTokenUpdateMany = jest.fn();
  const prisma = {
    refreshToken: {
      findMany: refreshTokenFindMany,
      findFirst: refreshTokenFindFirst,
      update: refreshTokenUpdate,
      updateMany: refreshTokenUpdateMany,
    },
  } as unknown as PrismaService;

  let service: SessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionsService(prisma);
  });

  describe('listSessions', () => {
    it('flags the session matching the supplied current refresh token', async () => {
      const currentToken = 'raw-current-refresh-token';
      refreshTokenFindMany.mockResolvedValue([
        {
          id: 'session-1',
          tokenHash: hashRefreshToken(currentToken),
          deviceName: 'Chrome on Windows',
          deviceType: 'WEB',
          userAgent: 'ua-1',
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-07-01'),
          lastUsedAt: new Date('2026-07-10'),
        },
        {
          id: 'session-2',
          tokenHash: 'some-other-hash',
          deviceName: 'Safari on iPhone',
          deviceType: 'MOBILE',
          userAgent: 'ua-2',
          ipAddress: '10.0.0.1',
          createdAt: new Date('2026-06-01'),
          lastUsedAt: null,
        },
      ]);

      const sessions = await service.listSessions('user-1', currentToken);

      expect(sessions).toHaveLength(2);
      expect(sessions.find((s) => s.id === 'session-1')?.isCurrent).toBe(true);
      expect(sessions.find((s) => s.id === 'session-2')?.isCurrent).toBe(false);
      // tokenHash must never leak into the response.
      expect(sessions[0]).not.toHaveProperty('tokenHash');
    });

    it('marks nothing as current when no refresh token is supplied', async () => {
      refreshTokenFindMany.mockResolvedValue([
        {
          id: 'session-1',
          tokenHash: 'some-hash',
          deviceName: null,
          deviceType: null,
          userAgent: null,
          ipAddress: null,
          createdAt: new Date(),
          lastUsedAt: null,
        },
      ]);

      const sessions = await service.listSessions('user-1');

      expect(sessions[0].isCurrent).toBe(false);
    });

    it('only queries active (non-revoked, non-expired) sessions', async () => {
      refreshTokenFindMany.mockResolvedValue([]);

      await service.listSessions('user-1');

      expect(refreshTokenFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            revokedAt: null,
            expiresAt: { gt: expect.any(Date) as Date },
          },
        }),
      );
    });
  });

  describe('revokeSession', () => {
    it('revokes an owned, not-yet-revoked session', async () => {
      refreshTokenFindFirst.mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
      });

      await service.revokeSession('user-1', 'session-1');

      expect(refreshTokenFindFirst).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
        select: { id: true, revokedAt: true },
      });
      expect(refreshTokenUpdate).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { revokedAt: expect.any(Date) as Date },
        select: { id: true },
      });
    });

    it('throws NotFoundException for a session owned by another user or that does not exist', async () => {
      refreshTokenFindFirst.mockResolvedValue(null);

      await expect(
        service.revokeSession('user-1', 'someone-elses-session'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(refreshTokenUpdate).not.toHaveBeenCalled();
    });

    it('is a no-op for an already-revoked session', async () => {
      refreshTokenFindFirst.mockResolvedValue({
        id: 'session-1',
        revokedAt: new Date(),
      });

      await service.revokeSession('user-1', 'session-1');

      expect(refreshTokenUpdate).not.toHaveBeenCalled();
    });
  });

  describe('revokeOtherSessions', () => {
    it('revokes every active session except the one matching the current refresh token', async () => {
      refreshTokenUpdateMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeOtherSessions(
        'user-1',
        'raw-current-refresh-token',
      );

      expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          tokenHash: { not: hashRefreshToken('raw-current-refresh-token') },
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result).toEqual({ revokedCount: 3 });
    });
  });
});
