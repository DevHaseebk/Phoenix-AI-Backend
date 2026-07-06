import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ActivityLevel,
  Gender,
  GoalPace,
  GoalType,
  OnboardingStatus,
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

interface OnboardingStateResponseBody {
  success: boolean;
  message: string;
  data: {
    status: string;
    currentStep: string | null;
    completedSteps: string[];
    draft: Record<string, unknown>;
  };
  meta: Record<string, never>;
}

interface CompleteOnboardingResponseBody {
  success: boolean;
  message: string;
  data: {
    profile: {
      currentWeightKg: number;
      targetWeightKg: number;
      dailyCalorieTarget: number;
      dailyProteinTargetGrams: number;
    };
    firstWinOptions: Array<{
      type: string;
      label: string;
    }>;
  };
  meta: Record<string, never>;
}

describe('Onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let config: ConfigService;
  const userFindUnique = jest.fn();
  const onboardingFindUnique = jest.fn();
  const onboardingUpsert = jest.fn();
  const profileUpsert = jest.fn();
  const prisma = {
    readinessCheck: jest.fn().mockResolvedValue(true),
    user: {
      findUnique: userFindUnique,
    },
    userOnboarding: {
      findUnique: onboardingFindUnique,
      upsert: onboardingUpsert,
    },
    userProfile: {
      upsert: profileUpsert,
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

  it('requires auth for all onboarding routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/onboarding').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/onboarding/step')
      .send({ step: 'BASIC_INFO', data: {} })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/onboarding/complete')
      .send(validCompletePayload())
      .expect(401);
  });

  it('returns default state when onboarding is absent', async () => {
    onboardingFindUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/v1/onboarding')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          success: true,
          message: 'Fetched successfully',
          data: {
            status: OnboardingStatus.NOT_STARTED,
            currentStep: null,
            completedSteps: [],
            draft: {},
          },
          meta: {},
        });
      });
  });

  it('saves onboarding step', async () => {
    onboardingFindUnique.mockResolvedValue(null);
    onboardingUpsert.mockResolvedValue({
      status: OnboardingStatus.IN_PROGRESS,
      currentStep: 'ACTIVITY_LEVEL',
      completedSteps: ['BASIC_INFO'],
      draft: { BASIC_INFO: { heightCm: 188 } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/onboarding/step')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        step: 'BASIC_INFO',
        data: { heightCm: 188 },
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as OnboardingStateResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Onboarding step saved successfully');
        expect(body.data.completedSteps).toEqual(['BASIC_INFO']);
        expect(body.data.draft).toEqual({ BASIC_INFO: { heightCm: 188 } });
      });

    expect(onboardingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          draft: { BASIC_INFO: { heightCm: 188 } },
        }) as Record<string, unknown>,
        update: expect.objectContaining({
          draft: { BASIC_INFO: { heightCm: 188 } },
        }) as Record<string, unknown>,
      }),
    );
  });

  it('completes onboarding with calculated targets', async () => {
    profileUpsert.mockResolvedValue({ id: 'profile-id' });
    onboardingUpsert.mockResolvedValue({ id: 'onboarding-id' });

    await request(app.getHttpServer())
      .post('/api/v1/onboarding/complete')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send(validCompletePayload())
      .expect(201)
      .expect((response) => {
        const body = response.body as CompleteOnboardingResponseBody;

        expect(body.success).toBe(true);
        expect(body.message).toBe('Onboarding completed successfully');
        expect(body.data.profile.currentWeightKg).toBe(150);
        expect(body.data.profile.targetWeightKg).toBe(100);
        expect(body.data.profile.dailyCalorieTarget).toBeGreaterThan(0);
        expect(body.data.profile.dailyProteinTargetGrams).toBe(160);
        expect(body.data.firstWinOptions).toEqual([
          { type: 'UPDATE_WEIGHT', label: 'Update Weight' },
          { type: 'LOG_FIRST_MEAL', label: 'Log First Meal' },
          { type: 'LOG_WATER', label: 'Log Water' },
          { type: 'OPEN_DASHBOARD', label: 'Open Dashboard' },
        ]);
        expect(body.data).not.toHaveProperty('passwordHash');
      });

    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-id' },
        create: expect.objectContaining({
          calorieTarget: expect.any(Number) as number,
          proteinTargetGrams: expect.any(Number) as number,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('rejects manual calorie/protein target fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/onboarding/complete')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        ...validCompletePayload(),
        calorieTarget: 1000,
        proteinTargetGrams: 50,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
    expect(profileUpsert).not.toHaveBeenCalled();
  });

  it('rejects false commitmentAccepted', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/onboarding/complete')
      .set('authorization', `Bearer ${createAccessToken()}`)
      .send({
        ...validCompletePayload(),
        commitmentAccepted: false,
      })
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorResponseBody;

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });
    expect(profileUpsert).not.toHaveBeenCalled();
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

function validCompletePayload(): Record<string, unknown> {
  return {
    gender: Gender.MALE,
    dateOfBirth: '1998-01-01',
    heightCm: 188,
    currentWeightKg: 150,
    targetWeightKg: 100,
    goalType: GoalType.LOSE_WEIGHT,
    goalPace: GoalPace.BALANCED,
    activityLevel: ActivityLevel.SEDENTARY,
    timezone: 'Asia/Karachi',
    preferredLanguage: 'en',
    foodPreferences: ['CHICKEN'],
    foodDislikes: ['OATS'],
    commitmentAccepted: true,
  };
}
