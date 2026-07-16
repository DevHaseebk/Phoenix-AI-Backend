import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const findUnique = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const refreshTokenCreate = jest.fn();
  const refreshTokenFindUnique = jest.fn();
  const refreshTokenFindFirst = jest.fn();
  const refreshTokenUpdate = jest.fn();
  const prisma = {
    user: {
      findUnique,
      create: userCreate,
      update: userUpdate,
    },
    refreshToken: {
      create: refreshTokenCreate,
      findUnique: refreshTokenFindUnique,
      findFirst: refreshTokenFindFirst,
      update: refreshTokenUpdate,
    },
  } as unknown as PrismaService;
  const sendMailFireAndForget = jest.fn();
  const mailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendMailFireAndForget,
  } as unknown as import('../mail/mail.service').MailService;
  const sendVerificationEmail = jest.fn().mockResolvedValue(undefined);
  const emailVerificationService = {
    sendVerificationEmail,
  } as unknown as import('./email-verification.service').EmailVerificationService;
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
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'test-google-client-id',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    refreshTokenFindFirst.mockResolvedValue(null);
    sendVerificationEmail.mockResolvedValue(undefined);
  });

  it('creates a user with normalized email and hashed password', async () => {
    userCreate.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });
    findUnique.mockResolvedValue(null);

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
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
        subscription: {
          create: {
            status: 'TRIALING',
            trialEndsAt: expect.any(Date) as Date,
          },
        },
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

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

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

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
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
      select: { id: true },
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

  it('sends a new-login alert when this exact device has not logged in recently', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash: await argon2.hash('StrongPassword123', {
        type: argon2.argon2id,
      }),
      status: 'ACTIVE',
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });
    refreshTokenFindFirst.mockResolvedValue(null); // no recent same-device session

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    await service.login({
      email: 'haseeb@example.com',
      password: 'StrongPassword123',
      device: { deviceName: 'Chrome on Windows', deviceType: 'WEB' },
    });

    expect(sendMailFireAndForget).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'haseeb@example.com' }),
    );
  });

  it('skips the new-login alert when this exact device logged in recently', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash: await argon2.hash('StrongPassword123', {
        type: argon2.argon2id,
      }),
      status: 'ACTIVE',
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });
    refreshTokenFindFirst.mockResolvedValue({ id: 'recent-session-id' }); // same device seen recently

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    await service.login({
      email: 'haseeb@example.com',
      password: 'StrongPassword123',
      device: { deviceName: 'Chrome on Windows', deviceType: 'WEB' },
    });

    expect(sendMailFireAndForget).not.toHaveBeenCalled();
  });

  it('rejects invalid login credentials with a generic error', async () => {
    findUnique.mockResolvedValue(null);

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

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

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

    await expect(
      service.login({
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('promotes ADMIN_BOOTSTRAP_EMAIL to ADMIN on first matching login', async () => {
    const passwordHash = await argon2.hash('StrongPassword123', {
      type: argon2.argon2id,
    });
    findUnique.mockResolvedValue({
      id: 'founder-id',
      fullName: 'Founder',
      email: 'founder@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: UserRole.USER,
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'founder-id' });

    const bootstrapConfig = {
      ...config,
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-google-client-id',
          ADMIN_BOOTSTRAP_EMAIL: 'Founder@example.com ',
        };

        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new AuthService(
      prisma,
      jwtService,
      bootstrapConfig,
      mailService,
      emailVerificationService,
    );

    await service.login({
      email: 'founder@example.com',
      password: 'StrongPassword123',
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'founder-id' },
      data: { role: UserRole.ADMIN },
      select: { id: true },
    });
  });

  it('does not re-promote or touch an already-ADMIN bootstrap account', async () => {
    const passwordHash = await argon2.hash('StrongPassword123', {
      type: argon2.argon2id,
    });
    findUnique.mockResolvedValue({
      id: 'founder-id',
      fullName: 'Founder',
      email: 'founder@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: UserRole.ADMIN,
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'founder-id' });

    const bootstrapConfig = {
      ...config,
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_BOOTSTRAP_EMAIL: 'founder@example.com',
        };

        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new AuthService(
      prisma,
      jwtService,
      bootstrapConfig,
      mailService,
      emailVerificationService,
    );

    await service.login({
      email: 'founder@example.com',
      password: 'StrongPassword123',
    });

    expect(userUpdate).not.toHaveBeenCalledWith({
      where: { id: 'founder-id' },
      data: { role: UserRole.ADMIN },
      select: { id: true },
    });
  });

  it('does not promote a non-matching email even when ADMIN_BOOTSTRAP_EMAIL is set', async () => {
    const passwordHash = await argon2.hash('StrongPassword123', {
      type: argon2.argon2id,
    });
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: UserRole.USER,
      deletedAt: null,
    });
    signAsync.mockResolvedValue('jwt-access-token');
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });

    const bootstrapConfig = {
      ...config,
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          ADMIN_BOOTSTRAP_EMAIL: 'founder@example.com',
        };

        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new AuthService(
      prisma,
      jwtService,
      bootstrapConfig,
      mailService,
      emailVerificationService,
    );

    await service.login({
      email: 'haseeb@example.com',
      password: 'StrongPassword123',
    });

    expect(userUpdate).not.toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { role: UserRole.ADMIN },
      select: { id: true },
    });
  });

  it('refreshes an access token with a valid opaque refresh token', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: 'refresh-token-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });
    signAsync.mockResolvedValue('new-access-token');

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    const response = await service.refreshAccessToken('opaque-refresh-token');

    expect(refreshTokenFindUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('opaque-refresh-token')
          .digest('hex'),
      },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
    expect(refreshTokenUpdate).toHaveBeenCalledWith({
      where: { id: 'refresh-token-id' },
      data: { lastUsedAt: expect.any(Date) as Date },
      select: { id: true },
    });
    expect(signAsync).toHaveBeenCalledWith(
      {
        sub: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
      },
      {
        secret: 'test-access-secret',
        expiresIn: '15m',
      },
    );
    expect(response).toEqual({
      accessToken: 'new-access-token',
      expiresIn: 900,
    });
    expect(response).not.toHaveProperty('refreshToken');
    expect(response).not.toHaveProperty('tokenHash');
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('rejects missing or unknown refresh tokens', async () => {
    refreshTokenFindUnique.mockResolvedValue(null);

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

    await expect(service.refreshAccessToken('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects revoked refresh tokens', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

    await expect(
      service.refreshAccessToken('revoked-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects expired refresh tokens', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

    await expect(
      service.refreshAccessToken('expired-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects refresh tokens for inactive or deleted users', async () => {
    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );

    refreshTokenFindUnique.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.SUSPENDED,
        deletedAt: null,
      },
    });
    await expect(
      service.refreshAccessToken('inactive-user-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    refreshTokenFindUnique.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: new Date(),
      },
    });
    await expect(
      service.refreshAccessToken('deleted-user-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(signAsync).not.toHaveBeenCalled();
  });

  it('revokes a valid refresh token during logout', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: null,
    });
    refreshTokenUpdate.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: new Date(),
    });

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    await expect(
      service.logout('opaque-refresh-token'),
    ).resolves.toBeUndefined();

    expect(refreshTokenFindUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('opaque-refresh-token')
          .digest('hex'),
      },
      select: {
        id: true,
        revokedAt: true,
      },
    });
    expect(refreshTokenUpdate).toHaveBeenCalledWith({
      where: { id: 'refresh-token-id' },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('returns success for already revoked refresh tokens during logout', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: new Date(),
    });

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    await expect(
      service.logout('revoked-refresh-token'),
    ).resolves.toBeUndefined();

    expect(refreshTokenUpdate).not.toHaveBeenCalled();
  });

  it('returns success for unknown refresh tokens during logout', async () => {
    refreshTokenFindUnique.mockResolvedValue(null);

    const service = new AuthService(
      prisma,
      jwtService,
      config,
      mailService,
      emailVerificationService,
    );
    const response = await service.logout('unknown-refresh-token');

    expect(response).toBeUndefined();
    expect(refreshTokenUpdate).not.toHaveBeenCalled();
  });

  describe('loginWithGoogle', () => {
    function mockGooglePayload(
      overrides: Partial<{
        email: string;
        email_verified: boolean;
        sub: string;
        name: string;
      }> = {},
    ) {
      const payload = {
        email: 'haseeb@example.com',
        email_verified: true,
        sub: 'google-sub-123',
        name: 'Haseeb Khan',
        ...overrides,
      };

      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => payload,
      } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('creates a new user (no password) when no account matches by googleId or email', async () => {
      mockGooglePayload();
      findUnique.mockResolvedValueOnce(null); // by googleId
      findUnique.mockResolvedValueOnce(null); // by email
      userCreate.mockResolvedValue({
        id: 'new-user-id',
        fullName: 'Haseeb Khan',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      });
      signAsync.mockResolvedValue('jwt-access-token');

      const service = new AuthService(
        prisma,
        jwtService,
        config,
        mailService,
        emailVerificationService,
      );
      const response = await service.loginWithGoogle({
        idToken: 'valid-id-token',
      });

      expect(userCreate).toHaveBeenCalledWith({
        data: {
          email: 'haseeb@example.com',
          fullName: 'Haseeb Khan',
          googleId: 'google-sub-123',
          emailVerifiedAt: expect.any(Date) as Date,
          subscription: {
            create: {
              status: 'TRIALING',
              trialEndsAt: expect.any(Date) as Date,
            },
          },
        },
        select: expect.any(Object) as object,
      });
      expect(response.user).toEqual({
        id: 'new-user-id',
        fullName: 'Haseeb Khan',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
      });
      expect(response.tokens.accessToken).toBe('jwt-access-token');
    });

    it('links Google to an existing email/password account instead of creating a duplicate', async () => {
      mockGooglePayload();
      findUnique.mockResolvedValueOnce(null); // by googleId - not linked yet
      findUnique.mockResolvedValueOnce({
        id: 'existing-user-id',
        fullName: 'Haseeb Khan',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      }); // by email - existing password account
      userUpdate.mockResolvedValue({
        id: 'existing-user-id',
        fullName: 'Haseeb Khan',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      });
      signAsync.mockResolvedValue('jwt-access-token');

      const service = new AuthService(
        prisma,
        jwtService,
        config,
        mailService,
        emailVerificationService,
      );
      const response = await service.loginWithGoogle({
        idToken: 'valid-id-token',
      });

      expect(userCreate).not.toHaveBeenCalled();
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'existing-user-id' },
        data: { googleId: 'google-sub-123' },
        select: expect.any(Object) as object,
      });
      expect(response.user.id).toBe('existing-user-id');
    });

    it('finds a returning Google user directly by googleId without touching email lookup', async () => {
      mockGooglePayload();
      findUnique.mockResolvedValueOnce({
        id: 'existing-user-id',
        fullName: 'Haseeb Khan',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      }); // by googleId - already linked
      signAsync.mockResolvedValue('jwt-access-token');

      const service = new AuthService(
        prisma,
        jwtService,
        config,
        mailService,
        emailVerificationService,
      );
      const response = await service.loginWithGoogle({
        idToken: 'valid-id-token',
      });

      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(userCreate).not.toHaveBeenCalled();
      // issueSession() still stamps lastActiveAt - only the googleId-linking
      // update (a different `data` shape) must not have happened.
      const userUpdateCalls = userUpdate.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;

      expect(userUpdateCalls.some((call) => 'googleId' in call[0].data)).toBe(
        false,
      );
      expect(response.user.id).toBe('existing-user-id');
    });

    it('rejects an unverified Google email', async () => {
      mockGooglePayload({ email_verified: false });

      const service = new AuthService(
        prisma,
        jwtService,
        config,
        mailService,
        emailVerificationService,
      );

      await expect(
        service.loginWithGoogle({ idToken: 'valid-id-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid or unverifiable Google ID token', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockRejectedValue(new Error('bad signature'));

      const service = new AuthService(
        prisma,
        jwtService,
        config,
        mailService,
        emailVerificationService,
      );

      await expect(
        service.loginWithGoogle({ idToken: 'garbage-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when GOOGLE_CLIENT_ID is not configured', async () => {
      const unconfigured = {
        ...config,
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      const service = new AuthService(
        prisma,
        jwtService,
        unconfigured,
        mailService,
        emailVerificationService,
      );

      await expect(
        service.loginWithGoogle({ idToken: 'valid-id-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
