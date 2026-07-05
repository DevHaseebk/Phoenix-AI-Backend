import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const findUnique = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const refreshTokenCreate = jest.fn();
  const prisma = {
    user: {
      findUnique,
      create: userCreate,
      update: userUpdate,
    },
    refreshToken: {
      create: refreshTokenCreate,
    },
  } as unknown as PrismaService;
  const signAsync = jest.fn();
  const jwtService = {
    signAsync,
  } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '30d',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a user with normalized email and hashed password', async () => {
    userCreate.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });
    findUnique.mockResolvedValue(null);

    const service = new AuthService(prisma, jwtService, config);
    const response = await service.signup({
      fullName: ' Haseeb ',
      email: ' HASEEB@example.com ',
      password: 'StrongPassword123',
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'haseeb@example.com' },
      select: { id: true },
    });
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: 'haseeb@example.com',
        fullName: 'Haseeb',
        passwordHash: expect.any(String) as string,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
      },
    });

    const createCalls = userCreate.mock.calls as Array<
      [{ data: { passwordHash: string } }]
    >;
    const createArgs = createCalls[0][0];

    expect(createArgs.data.passwordHash).not.toBe('StrongPassword123');
    await expect(
      argon2.verify(createArgs.data.passwordHash, 'StrongPassword123'),
    ).resolves.toBe(true);
    expect(response.user).toEqual({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });
  });

  it('rejects duplicate email registration', async () => {
    findUnique.mockResolvedValue({ id: 'existing-user-id' });

    const service = new AuthService(prisma, jwtService, config);

    await expect(
      service.signup({
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('logs in with access token and hashed refresh token storage', async () => {
    const passwordHash = await argon2.hash('StrongPassword123', {
      type: argon2.argon2id,
    });
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash,
      status: 'ACTIVE',
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });

    const service = new AuthService(prisma, jwtService, config);
    const response = await service.login(
      {
        email: ' HASEEB@example.com ',
        password: 'StrongPassword123',
        device: {
          deviceName: 'Chrome on Windows',
          deviceType: 'WEB',
        },
      },
      {
        userAgent: 'test-user-agent',
        ipAddress: '127.0.0.1',
      },
    );

    expect(signAsync).toHaveBeenCalledWith(
      {
        sub: 'user-id',
        email: 'haseeb@example.com',
        status: 'ACTIVE',
      },
      {
        secret: 'test-access-secret',
        expiresIn: '15m',
      },
    );
    expect(refreshTokenCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        tokenHash: expect.any(String) as string,
        deviceName: 'Chrome on Windows',
        deviceType: 'WEB',
        userAgent: 'test-user-agent',
        ipAddress: '127.0.0.1',
        expiresAt: expect.any(Date) as Date,
      },
    });
    const refreshTokenCreateCalls = refreshTokenCreate.mock.calls as Array<
      [
        {
          data: {
            tokenHash: string;
            expiresAt: Date;
          };
        },
      ]
    >;
    const refreshTokenData = refreshTokenCreateCalls[0][0].data;
    const returnedRefreshTokenHash = createHash('sha256')
      .update(response.tokens.refreshToken)
      .digest('hex');

    expect(refreshTokenData.tokenHash).toBe(returnedRefreshTokenHash);
    expect(refreshTokenData.tokenHash).not.toBe(response.tokens.refreshToken);
    expect(refreshTokenData.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { lastActiveAt: expect.any(Date) as Date },
    });
    expect(response).toEqual({
      user: {
        id: 'user-id',
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        status: 'ACTIVE',
      },
      tokens: {
        accessToken: 'jwt-access-token',
        refreshToken: expect.any(String) as string,
      },
    });
  });

  it('rejects invalid login credentials with a generic error', async () => {
    findUnique.mockResolvedValue(null);

    const service = new AuthService(prisma, jwtService, config);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'WrongPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects suspended users with the same generic error', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash: await argon2.hash('StrongPassword123', {
        type: argon2.argon2id,
      }),
      status: 'SUSPENDED',
      deletedAt: null,
    });

    const service = new AuthService(prisma, jwtService, config);

    await expect(
      service.login({
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });
});
