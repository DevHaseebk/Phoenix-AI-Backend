import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExerciseLogSource,
  ExerciseType,
  Prisma,
  UserStatus,
} from '@prisma/client';
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

interface ExerciseLogResponseBody {
  success: boolean;
  message: string;
  data: {
    id: string;
    exerciseType: string;
    durationMinutes: number;
    steps: number | null;
    distanceKm: number | null;
    estimatedCaloriesBurned: number | null;
    loggedAt: string;
    source: string;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  };
  meta: Record<string, never>;
}

interface ExerciseLogListResponseBody {
  success: boolean;
  message: string;
  data: Array<ExerciseLogResponseBody['data']>;
  meta: Record<string, never>;
}

describe('Exercise Logs (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const exerciseLogCreate = jest.fn();
  const exerciseLogFindMany = jest.fn();
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
      create: jest.fn(),
      findMany: jest.fn(),
    },
    exerciseLog: {
      create: exerciseLogCreate,
      findMany: exerciseLogFindMany,
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

  it('requires auth for exercise log routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/logs/exercise').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/logs/exercise')
      .send({ exerciseType: ExerciseType.WALKING, durationMinutes: 30 })
      .expect(401);
  });

  it('creates an exercise log for the current user', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    exerciseLogCreate.mockResolvedValue({
      id: 'exercise-log-id',
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      steps: 4000,
      distanceKm: new Prisma.Decimal('3.2'),
      estimatedCaloriesBurned: 220,
      loggedAt,
      source: ExerciseLogSource.MANUAL,
      note: 'Morning walk',
      createdAt,
      updatedAt,
    });

    await request(app.getHttpServer())
      .post('/api/v1/logs/exercise')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: 3.2,
        estimatedCaloriesBurned: 220,
        loggedAt: loggedAt.toISOString(),
        note: 'Morning walk',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as ExerciseLogResponseBody;

        expect(body).toEqual({
          success: true,
          message: 'Exercise logged successfully',
          data: {
            id: 'exercise-log-id',
            exerciseType: ExerciseType.WALKING,
            durationMinutes: 30,
            steps: 4000,
            distanceKm: 3.2,
            estimatedCaloriesBurned: 220,
            loggedAt: loggedAt.toISOString(),
            source: ExerciseLogSource.MANUAL,
            note: 'Morning walk',
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

    expect(exerciseLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: 3.2,
        estimatedCaloriesBurned: 220,
        loggedAt,
        source: ExerciseLogSource.MANUAL,
        note: 'Morning walk',
      },
      select: expect.any(Object) as Record<string, boolean>,
    });
  });

  it('rejects invalid exerciseType', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/exercise')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        exerciseType: 'INVALID',
        durationMinutes: 30,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(exerciseLogCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid durationMinutes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/exercise')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 0,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(exerciseLogCreate).not.toHaveBeenCalled();
  });

  it('rejects client-controlled userId and source fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/logs/exercise')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        userId: 'other-user-id',
        source: ExerciseLogSource.DEVICE,
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(exerciseLogCreate).not.toHaveBeenCalled();
  });

  it('lists only current user exercise logs and respects filters', async () => {
    const loggedAt = new Date('2026-07-06T08:00:00.000Z');
    const createdAt = new Date('2026-07-06T08:01:00.000Z');
    const updatedAt = new Date('2026-07-06T08:01:00.000Z');

    exerciseLogFindMany.mockResolvedValue([
      {
        id: 'exercise-log-id',
        exerciseType: ExerciseType.WALKING,
        durationMinutes: 30,
        steps: 4000,
        distanceKm: new Prisma.Decimal('3.2'),
        estimatedCaloriesBurned: 220,
        loggedAt,
        source: ExerciseLogSource.MANUAL,
        note: null,
        createdAt,
        updatedAt,
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/v1/logs/exercise?limit=1&exerciseType=WALKING')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ExerciseLogListResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Fetched successfully');
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toEqual({
          id: 'exercise-log-id',
          exerciseType: ExerciseType.WALKING,
          durationMinutes: 30,
          steps: 4000,
          distanceKm: 3.2,
          estimatedCaloriesBurned: 220,
          loggedAt: loggedAt.toISOString(),
          source: ExerciseLogSource.MANUAL,
          note: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        });
        expect(body.data[0]).not.toHaveProperty('userId');
        expect(body.data[0]).not.toHaveProperty('passwordHash');
      });

    expect(exerciseLogFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        exerciseType: ExerciseType.WALKING,
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
