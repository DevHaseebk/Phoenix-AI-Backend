import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

interface SignupResponseBody {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      fullName: string;
      email: string;
      status: string;
    };
  };
  meta: Record<string, never>;
}

interface LoginResponseBody {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      fullName: string;
      email: string;
      status: string;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
  meta: Record<string, never>;
}

interface RefreshResponseBody {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    expiresIn: number;
  };
  meta: Record<string, never>;
}

interface LogoutResponseBody {
  success: boolean;
  message: string;
  data: null;
  meta: Record<string, never>;
}

interface ErrorResponseBody {
  success: false;
  message: string;
  error: {
    code: string;
    details: unknown[];
  };
}

describe('Auth signup (e2e)', () => {
  let app: INestApplication<App>;
  const findUnique = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const refreshTokenCreate = jest.fn();
  const refreshTokenFindUnique = jest.fn();
  const refreshTokenUpdate = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique,
      create: userCreate,
      update: userUpdate,
    },
    refreshToken: {
      create: refreshTokenCreate,
      findUnique: refreshTokenFindUnique,
      update: refreshTokenUpdate,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an account without returning password data or tokens', async () => {
    findUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      status: 'ACTIVE',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'Haseeb',
        email: 'HASEEB@example.com',
        password: 'StrongPassword123',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as SignupResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Account created successfully');
        expect(body.data.user).toEqual({
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
          status: 'ACTIVE',
        });
        expect(body.data).not.toHaveProperty('tokens');
        expect(body.data.user).not.toHaveProperty('passwordHash');
      });
  });

  it('logs in and returns access and refresh tokens', async () => {
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
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('user-agent', 'supertest')
      .send({
        email: 'HASEEB@example.com',
        password: 'StrongPassword123',
        device: {
          deviceName: 'Chrome on Windows',
          deviceType: 'WEB',
        },
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as LoginResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Logged in successfully');
        expect(body.data.user).toEqual({
          id: 'user-id',
          fullName: 'Haseeb',
          email: 'haseeb@example.com',
          status: 'ACTIVE',
        });
        expect(typeof body.data.tokens.accessToken).toBe('string');
        expect(typeof body.data.tokens.refreshToken).toBe('string');
        expect(body.data.tokens.refreshToken.length).toBeGreaterThan(40);
        expect(body.data.user).not.toHaveProperty('passwordHash');
      });

    expect(refreshTokenCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        tokenHash: expect.any(String) as string,
        deviceName: 'Chrome on Windows',
        deviceType: 'WEB',
        userAgent: 'supertest',
        ipAddress: expect.any(String) as string,
        expiresAt: expect.any(Date) as Date,
      },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { lastActiveAt: expect.any(Date) as Date },
    });
  });

  it('refreshes an access token using a valid refresh token from login', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      fullName: 'Haseeb',
      email: 'haseeb@example.com',
      passwordHash: await argon2.hash('StrongPassword123', {
        type: argon2.argon2id,
      }),
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    refreshTokenCreate.mockResolvedValue({ id: 'refresh-token-id' });
    userUpdate.mockResolvedValue({ id: 'user-id' });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      })
      .expect(200);
    const loginBody = loginResponse.body as LoginResponseBody;
    const refreshToken = loginBody.data.tokens.refreshToken;
    const expectedTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    refreshTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200)
      .expect((response) => {
        const body = response.body as RefreshResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Token refreshed successfully');
        expect(typeof body.data.accessToken).toBe('string');
        expect(body.data.expiresIn).toBe(900);
        expect(body.data).not.toHaveProperty('refreshToken');
        expect(body.data).not.toHaveProperty('tokenHash');
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    expect(refreshTokenFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: expectedTokenHash },
      select: {
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
  });

  it('rejects missing refresh token payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({})
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Validation failed');
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
  });

  it('rejects invalid refresh tokens with a generic unauthorized response', async () => {
    refreshTokenFindUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'unknown-refresh-token' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Request failed');
        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.details).toEqual([{ message: 'Unauthorized' }]);
      });
  });

  it('rejects revoked refresh tokens with the same generic response', async () => {
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

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'revoked-refresh-token' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.details).toEqual([{ message: 'Unauthorized' }]);
      });
  });

  it('rejects expired refresh tokens with the same generic response', async () => {
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

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'expired-refresh-token' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.details).toEqual([{ message: 'Unauthorized' }]);
      });
  });

  it('rejects refresh tokens for inactive or deleted users', async () => {
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

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'inactive-user-refresh-token' })
      .expect(401);

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

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'deleted-user-refresh-token' })
      .expect(401);
  });

  it('logs out with a valid refresh token and revokes it', async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: null,
    });
    refreshTokenUpdate.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: new Date(),
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'opaque-refresh-token' })
      .expect(200)
      .expect((response) => {
        const body = response.body as LogoutResponseBody;

        expect(body).toEqual({
          success: true,
          message: 'Logged out successfully',
          data: null,
          meta: {},
        });
        expect(body).not.toHaveProperty('tokenHash');
        expect(body).not.toHaveProperty('passwordHash');
      });

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

  it('rejects refresh after logout revokes the token', async () => {
    refreshTokenFindUnique
      .mockResolvedValueOnce({
        id: 'refresh-token-id',
        revokedAt: null,
      })
      .mockResolvedValueOnce({
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        user: {
          id: 'user-id',
          email: 'haseeb@example.com',
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });
    refreshTokenUpdate.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: new Date(),
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'opaque-refresh-token' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'opaque-refresh-token' })
      .expect(401);
  });

  it('keeps logout idempotent when called twice', async () => {
    refreshTokenFindUnique
      .mockResolvedValueOnce({
        id: 'refresh-token-id',
        revokedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'refresh-token-id',
        revokedAt: new Date(),
      });
    refreshTokenUpdate.mockResolvedValue({
      id: 'refresh-token-id',
      revokedAt: new Date(),
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'opaque-refresh-token' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'opaque-refresh-token' })
      .expect(200);

    expect(refreshTokenUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns success for unknown refresh tokens during logout', async () => {
    refreshTokenFindUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'unknown-refresh-token' })
      .expect(200)
      .expect((response) => {
        const body = response.body as LogoutResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Logged out successfully');
        expect(body.data).toBeNull();
        expect(body).not.toHaveProperty('tokenHash');
        expect(body).not.toHaveProperty('passwordHash');
      });

    expect(refreshTokenUpdate).not.toHaveBeenCalled();
  });

  it('rejects missing logout refresh token payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({})
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Validation failed');
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
  });

  it('returns generic unauthorized response for invalid login', async () => {
    findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'WrongPassword123',
      })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Request failed');
        expect(body.error.code).toBe('UNAUTHORIZED');
        expect(body.error.details).toEqual([
          { message: 'Invalid email or password' },
        ]);
      });
  });

  it('returns conflict for duplicate email', async () => {
    findUnique.mockResolvedValue({ id: 'existing-user-id' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'Haseeb',
        email: 'haseeb@example.com',
        password: 'StrongPassword123',
      })
      .expect(409)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Request failed');
        expect(body.error.code).toBe('CONFLICT');
      });
  });

  it('rejects invalid signup payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        fullName: 'H',
        email: 'not-an-email',
        password: 'short',
        status: 'ACTIVE',
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.message).toBe('Validation failed');
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.details.length).toBeGreaterThan(0);
      });
  });
});
