import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

interface GetMeResponseBody {
  success: boolean;
  message: string;
  data: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    status: string;
    emailVerifiedAt: string | null;
    lastActiveAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
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

describe('Users /me (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const findUnique = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique,
      update,
    },
    refreshToken: {
      updateMany,
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

    jwtService = app.get(JwtService);
    config = app.get(ConfigService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
  });

  it('returns current authenticated user profile', async () => {
    const createdAt = new Date('2026-07-05T10:00:00.000Z');
    const updatedAt = new Date('2026-07-05T10:05:00.000Z');
    const lastActiveAt = new Date('2026-07-05T10:10:00.000Z');
    const token = jwtService.sign(
      {
        sub: 'user-id',
        email: 'haseeb@example.com',
        status: UserStatus.ACTIVE,
      },
      {
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );

    findUnique.mockImplementation(
      (args: { select: Record<string, boolean> }) => {
        if (args.select.phone) {
          return Promise.resolve({
            id: 'user-id',
            email: 'haseeb@example.com',
            fullName: 'Haseeb',
            phone: null,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: null,
            lastActiveAt,
            createdAt,
            updatedAt,
            deletedAt: null,
          });
        }

        return Promise.resolve({
          id: 'user-id',
          email: 'haseeb@example.com',
          status: UserStatus.ACTIVE,
          deletedAt: null,
        });
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as GetMeResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toEqual({
          id: 'user-id',
          email: 'haseeb@example.com',
          fullName: 'Haseeb',
          phone: null,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: null,
          lastActiveAt: lastActiveAt.toISOString(),
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        });
        expect(body.data).not.toHaveProperty('passwordHash');
      });
  });

  it('rejects profile updates without a token', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .send({ fullName: 'Haseeb Updated' })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
  });

  it('updates current user fullName', async () => {
    const createdAt = new Date('2026-07-05T10:00:00.000Z');
    const updatedAt = new Date('2026-07-05T10:05:00.000Z');
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);
    update.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb Updated',
      phone: null,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt: null,
      createdAt,
      updatedAt,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${token}`)
      .send({ fullName: ' Haseeb Updated ' })
      .expect(200)
      .expect((response) => {
        const body = response.body as GetMeResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Profile updated successfully');
        expect(body.data.fullName).toBe('Haseeb Updated');
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { fullName: 'Haseeb Updated' },
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  it('updates current user phone', async () => {
    const createdAt = new Date('2026-07-05T10:00:00.000Z');
    const updatedAt = new Date('2026-07-05T10:05:00.000Z');
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);
    update.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      fullName: 'Haseeb',
      phone: '+923001234567',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      lastActiveAt: null,
      createdAt,
      updatedAt,
    });

    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${token}`)
      .send({ phone: ' +923001234567 ' })
      .expect(200)
      .expect((response) => {
        const body = response.body as GetMeResponseBody;

        expect(body.data.phone).toBe('+923001234567');
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { phone: '+923001234567' },
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  it('rejects unsafe extra profile update fields', async () => {
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);

    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${token}`)
      .send({
        fullName: 'Haseeb Updated',
        status: UserStatus.SUSPENDED,
        passwordHash: 'not-allowed',
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects empty profile update bodies', async () => {
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);

    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
  });

  it('rejects password changes without a token', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .send({
        currentPassword: 'CurrentPassword123',
        newPassword: 'NewStrongPassword123',
      })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
  });

  it('changes current user password and revokes refresh tokens', async () => {
    const token = createAccessToken(jwtService, config);
    const currentPasswordHash = await argon2.hash('CurrentPassword123', {
      type: argon2.argon2id,
    });

    mockPasswordChangeLookups(findUnique, currentPasswordHash);
    update.mockResolvedValue({ id: 'user-id' });
    updateMany.mockResolvedValue({ count: 1 });

    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .set('authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'CurrentPassword123',
        newPassword: 'NewStrongPassword123',
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          success: boolean;
          message: string;
          data: null;
          meta: Record<string, never>;
        };

        expect(body).toEqual({
          success: true,
          message: 'Password changed successfully',
          data: null,
          meta: {},
        });
        expect(body).not.toHaveProperty('passwordHash');
      });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { passwordHash: expect.any(String) as string },
      select: { id: true },
    });
    const updateCalls = update.mock.calls as Array<
      [{ data: { passwordHash: string } }]
    >;

    expect(updateCalls[0][0].data.passwordHash).not.toBe(
      'NewStrongPassword123',
    );
    await expect(
      argon2.verify(
        updateCalls[0][0].data.passwordHash,
        'NewStrongPassword123',
      ),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('rejects wrong current password', async () => {
    const token = createAccessToken(jwtService, config);
    const currentPasswordHash = await argon2.hash('CurrentPassword123', {
      type: argon2.argon2id,
    });

    mockPasswordChangeLookups(findUnique, currentPasswordHash);

    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .set('authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'WrongPassword123',
        newPassword: 'NewStrongPassword123',
      })
      .expect(401)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });

    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects newPassword equal to currentPassword', async () => {
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);

    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .set('authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'SamePassword123',
        newPassword: 'SamePassword123',
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects too-short newPassword', async () => {
    const token = createAccessToken(jwtService, config);

    mockActiveUserLookups(findUnique);

    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .set('authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'CurrentPassword123',
        newPassword: 'short',
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(update).not.toHaveBeenCalled();
  });
});

function createAccessToken(
  jwtService: JwtService,
  config: ConfigService,
): string {
  return jwtService.sign(
    {
      sub: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
    },
    {
      secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    },
  );
}

function mockActiveUserLookups(findUnique: jest.Mock): void {
  findUnique.mockResolvedValue({
    id: 'user-id',
    email: 'haseeb@example.com',
    status: UserStatus.ACTIVE,
    deletedAt: null,
  });
}

function mockPasswordChangeLookups(
  findUnique: jest.Mock,
  passwordHash: string,
): void {
  findUnique.mockImplementation((args: { select: Record<string, boolean> }) => {
    if (args.select.passwordHash) {
      return Promise.resolve({
        id: 'user-id',
        passwordHash,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      });
    }

    return Promise.resolve({
      id: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
  });
}
