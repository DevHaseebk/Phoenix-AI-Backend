import {
  ActivityLevel,
  Gender,
  GoalPace,
  GoalType,
  OnboardingStatus,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

describe('OnboardingController', () => {
  const getState = jest.fn();
  const saveStep = jest.fn();
  const complete = jest.fn();
  const onboardingService = {
    getState,
    saveStep,
    complete,
  } as unknown as OnboardingService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard get onboarding response', async () => {
    getState.mockResolvedValue({
      status: OnboardingStatus.NOT_STARTED,
      currentStep: null,
      completedSteps: [],
      draft: {},
    });

    const controller = new OnboardingController(onboardingService);
    const response = await controller.getState(currentUser);

    expect(response.message).toBe('Fetched successfully');
    expect(response.data.status).toBe(OnboardingStatus.NOT_STARTED);
  });

  it('returns standard save step response', async () => {
    saveStep.mockResolvedValue({
      status: OnboardingStatus.IN_PROGRESS,
      currentStep: 'ACTIVITY_LEVEL',
      completedSteps: ['BASIC_INFO'],
      draft: { BASIC_INFO: { heightCm: 188 } },
    });

    const controller = new OnboardingController(onboardingService);
    const response = await controller.saveStep(currentUser, {
      step: 'BASIC_INFO',
      data: { heightCm: 188 },
    });

    expect(saveStep).toHaveBeenCalledWith('user-id', {
      step: 'BASIC_INFO',
      data: { heightCm: 188 },
    });
    expect(response.message).toBe('Onboarding step saved successfully');
    expect(response.data.draft).toEqual({ BASIC_INFO: { heightCm: 188 } });
  });

  it('returns standard complete onboarding response', async () => {
    const dto = {
      gender: Gender.MALE,
      dateOfBirth: new Date('1998-01-01'),
      heightCm: 188,
      currentWeightKg: 150,
      targetWeightKg: 100,
      goalType: GoalType.LOSE_WEIGHT,
      goalPace: GoalPace.BALANCED,
      activityLevel: ActivityLevel.SEDENTARY,
      commitmentAccepted: true as const,
    };
    complete.mockResolvedValue({
      profile: {
        currentWeightKg: 150,
        targetWeightKg: 100,
        dailyCalorieTarget: 2200,
        dailyProteinTargetGrams: 160,
      },
      firstWinOptions: [
        { type: 'UPDATE_WEIGHT', label: 'Update Weight' },
        { type: 'LOG_FIRST_MEAL', label: 'Log First Meal' },
        { type: 'LOG_WATER', label: 'Log Water' },
        { type: 'OPEN_DASHBOARD', label: 'Open Dashboard' },
      ],
    });

    const controller = new OnboardingController(onboardingService);
    const response = await controller.complete(currentUser, dto);

    expect(complete).toHaveBeenCalledWith('user-id', dto);
    expect(response.message).toBe('Onboarding completed successfully');
    expect(response.data.firstWinOptions).toEqual([
      { type: 'UPDATE_WEIGHT', label: 'Update Weight' },
      { type: 'LOG_FIRST_MEAL', label: 'Log First Meal' },
      { type: 'LOG_WATER', label: 'Log Water' },
      { type: 'OPEN_DASHBOARD', label: 'Open Dashboard' },
    ]);
  });
});
