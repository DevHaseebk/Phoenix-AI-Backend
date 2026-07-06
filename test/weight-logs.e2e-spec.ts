import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus, WeightLogSource } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './../src/common/interceptors/api-response.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

interface ErrorResponseBody {
  success: false;
  message: string;
  error: {
    code: string;
    details: unknown[];
  };
}

interface WeightLogResponseBody {
  success: boolean;
  message: string;
  data: {
    id: string;
    weightKg: number;
    loggedAt: string;
    source: string;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  };
  meta: Record<string, never>;
}

interface WeightLogListResponseBody {
  success: boolean;
  message: string;
  data: Array<WeightLogResponseBody['data']>;
  meta: Record<string, never>;
}

describe('Weight Logs (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const weightLogCreate = jest.fn();
  const weightLogFindMany = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique: userFindUnique,
    },
    weightLog: {
      create: weightLogCreate,
      findMany: weightLogFindMany,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockActiveUser();

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

  it('requires auth for weight log routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/logs/weight').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/logs/weight')
      .send({ weightKg: 149.8 })
      .expect(401);
  });

  it('creates a weight log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    weightLogCreate.mockResolvedValue({
      id: 'weight-log-id',
      weightKg: 149.8,
      loggedAt,
      source: WeightLogSource.MANUAL,
      note: 'Morning weight',
      createdAt,
      updatedAt,
    });

    await request(app.getHttpServer())
      .post('/api/v1/logs/weight')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        weightKg: 149.8,
        loggedAt: loggedAt.toISOString(),
        note: 'Morning weight',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as WeightLogResponseBody;

        expect(body).toEqual({
          success: true,
          message: 'Weight logged successfully',
          data: {
            id: 'weight-log-id',
            weightKg: 149.8,
            loggedAt: loggedAt.toISOString(),
            source: WeightLogSource.MANUAL,
            note: 'Morning weight',
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          },
          meta: {},
        });
        expect(body.data).not.toHaveProperty('userId');
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('profile');
        expect(body.data).not.toHaveProperty('refreshTokens');
      });

    expect(weightLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: 'Morning weight',
      },
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  it('rejects invalid weight', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/weight')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({ weightKg: 401 })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(weightLogCreate).not.toHaveBeenCalled();
  });

  it('rejects client-controlled userId and source fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/weight')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        userId: 'other-user-id',
        source: WeightLogSource.IMPORTED,
        weightKg: 149.8,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(weightLogCreate).not.toHaveBeenCalled();
  });

  it('lists only current user weight logs and respects limit', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    weightLogFindMany.mockResolvedValue([
      {
        id: 'weight-log-id',
        weightKg: 149.8,
        loggedAt,
        source: WeightLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/logs/weight?limit=1')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as WeightLogListResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toEqual({
          id: 'weight-log-id',
          weightKg: 149.8,
          loggedAt: loggedAt.toISOString(),
          source: WeightLogSource.MANUAL,
          note: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        });
        expect(body.data[0]).not.toHaveProperty('userId');
        expect(body.data[0]).not.toHaveProperty('passwordHash');
      });

    expect(weightLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        loggedAt: {},
      },
      orderBy: { loggedAt: 'desc' },
      take: 1,
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  function createAccessToken(): string {
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

  function mockActiveUser(): void {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'haseeb@example.com',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
  }
});
