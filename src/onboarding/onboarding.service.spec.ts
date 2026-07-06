import { UnauthorizedException } from '@nestjs/common';
import {
  ActivityLevel,
  Gender,
  GoalPace,
  GoalType,
  OnboardingStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const userFindUnique = jest.fn();
  const onboardingFindUnique = jest.fn();
  const onboardingUpsert = jest.fn();
  const profileUpsert = jest.fn();
  const prisma = {
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
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
  });

  it('returns default state when onboarding is absent', async () => {
    onboardingFindUnique.mockResolvedValue(null);

    const service = new OnboardingService(prisma);
    const response = await service.getState('user-id');

    expect(response).toEqual({
      status: OnboardingStatus.NOT_STARTED,
      currentStep: null,
      completedSteps: [],
      draft: {},
    });
  });

  it('saves onboarding step and merges draft data', async () => {
    onboardingFindUnique.mockResolvedValue({
      status: OnboardingStatus.IN_PROGRESS,
      currentStep: 'GOAL',
      completedSteps: ['WELCOME'],
      draft: { WELCOME: { accepted: true } },
    });
    onboardingUpsert.mockResolvedValue({
      status: OnboardingStatus.IN_PROGRESS,
      currentStep: 'ACTIVITY_LEVEL',
      completedSteps: ['WELCOME', 'BASIC_INFO'],
      draft: {
        WELCOME: { accepted: true },
        BASIC_INFO: { heightCm: 188 },
      },
    });

    const service = new OnboardingService(prisma);
    const response = await service.saveStep('user-id', {
      step: 'BASIC_INFO',
      data: { heightCm: 188 },
    });

    expect(onboardingUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      create: expect.objectContaining({
        userId: 'user-id',
        status: OnboardingStatus.IN_PROGRESS,
        draft: {
          WELCOME: { accepted: true },
          BASIC_INFO: { heightCm: 188 },
        },
      }) as Record<string, unknown>,
      update: expect.objectContaining({
        status: OnboardingStatus.IN_PROGRESS,
        currentStep: 'ACTIVITY_LEVEL',
        completedSteps: ['WELCOME', 'BASIC_INFO'],
        draft: {
          WELCOME: { accepted: true },
          BASIC_INFO: { heightCm: 188 },
        },
      }) as Record<string, unknown>,
      select: {
        status: true,
        currentStep: true,
        completedSteps: true,
        draft: true,
      },
    });
    expect(response.completedSteps).toEqual(['WELCOME', 'BASIC_INFO']);
    expect(response.draft).toEqual({
      WELCOME: { accepted: true },
      BASIC_INFO: { heightCm: 188 },
    });
  });

  it('completes onboarding and upserts profile plus completion state', async () => {
    profileUpsert.mockResolvedValue({ id: 'profile-id' });
    onboardingUpsert.mockResolvedValue({ id: 'onboarding-id' });

    const service = new OnboardingService(prisma);
    const response = await service.complete('user-id', {
      gender: Gender.MALE,
      dateOfBirth: new Date('1998-01-01'),
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
    });

    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-id' },
        create: expect.objectContaining({
          userId: 'user-id',
          calorieTarget: expect.any(Number) as number,
          proteinTargetGrams: expect.any(Number) as number,
        }) as Record<string, unknown>,
      }),
    );
    expect(onboardingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-id' },
        create: expect.objectContaining({
          status: OnboardingStatus.COMPLETED,
          completedAt: expect.any(Date) as Date,
        }) as Record<string, unknown>,
      }),
    );
    expect(response.profile.currentWeightKg).toBe(150);
    expect(response.profile.targetWeightKg).toBe(100);
    expect(response.profile.dailyCalorieTarget).toBeGreaterThan(0);
    expect(response.profile.dailyProteinTargetGrams).toBe(160);
    expect(response.firstWinOptions).toEqual([
      { type: 'UPDATE_WEIGHT', label: 'Update Weight' },
      { type: 'LOG_FIRST_MEAL', label: 'Log First Meal' },
      { type: 'LOG_WATER', label: 'Log Water' },
      { type: 'OPEN_DASHBOARD', label: 'Open Dashboard' },
    ]);
  });

  it('rejects inactive or deleted users', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    const service = new OnboardingService(prisma);

    await expect(service.getState('user-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
