import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
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
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique,
      create: userCreate,
      update: userUpdate,
    },
    refreshToken: {
      create: refreshTokenCreate,
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
