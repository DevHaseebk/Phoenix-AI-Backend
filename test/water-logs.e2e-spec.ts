import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus, WaterLogSource } from '@prisma/client';
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

interface WaterLogResponseBody {
  success: boolean;
  message: string;
  data: {
    id: string;
    amountMl: number;
    loggedAt: string;
    source: string;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  };
  meta: Record<string, never>;
}

interface WaterLogListResponseBody {
  success: boolean;
  message: string;
  data: Array<WaterLogResponseBody['data']>;
  meta: Record<string, never>;
}

describe('Water Logs (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const waterLogCreate = jest.fn();
  const waterLogFindMany = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique: userFindUnique,
    },
    weightLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    waterLog: {
      create: waterLogCreate,
      findMany: waterLogFindMany,
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

  it('requires auth for water log routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/logs/water').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/logs/water')
      .send({ amountMl: 500 })
      .expect(401);
  });

  it('creates a water log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    waterLogCreate.mockResolvedValue({
      id: 'water-log-id',
      amountMl: 500,
      loggedAt,
      source: WaterLogSource.MANUAL,
      note: 'Morning water',
      createdAt,
      updatedAt,
    });

    await request(app.getHttpServer())
      .post('/api/v1/logs/water')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        amountMl: 500,
        loggedAt: loggedAt.toISOString(),
        note: 'Morning water',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as WaterLogResponseBody;

        expect(body).toEqual({
          success: true,
          message: 'Water logged successfully',
          data: {
            id: 'water-log-id',
            amountMl: 500,
            loggedAt: loggedAt.toISOString(),
            source: WaterLogSource.MANUAL,
            note: 'Morning water',
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

    expect(waterLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: 'Morning water',
      },
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  it('rejects invalid amountMl', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/water')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({ amountMl: 5001 })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(waterLogCreate).not.toHaveBeenCalled();
  });

  it('rejects client-controlled userId and source fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/water')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        userId: 'other-user-id',
        source: WaterLogSource.IMPORTED,
        amountMl: 500,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(waterLogCreate).not.toHaveBeenCalled();
  });

  it('lists only current user water logs and respects limit', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    waterLogFindMany.mockResolvedValue([
      {
        id: 'water-log-id',
        amountMl: 500,
        loggedAt,
        source: WaterLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/logs/water?limit=1')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as WaterLogListResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toEqual({
          id: 'water-log-id',
          amountMl: 500,
          loggedAt: loggedAt.toISOString(),
          source: WaterLogSource.MANUAL,
          note: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        });
        expect(body.data[0]).not.toHaveProperty('userId');
        expect(body.data[0]).not.toHaveProperty('passwordHash');
      });

    expect(waterLogFindMany).toHaveBeenCalledWith({
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
