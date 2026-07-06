import { UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryRange } from './dto/dashboard-summary-query.dto';

describe('DashboardController', () => {
  const getToday = jest.fn();
  const getSummary = jest.fn();
  const dashboardService = {
    getToday,
    getSummary,
  } as unknown as DashboardService;
  const currentUser: AuthenticatedUser = {
    userId: 'user-id',
    email: 'haseeb@example.com',
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns standard dashboard today response', async () => {
    getToday.mockResolvedValue({
      date: '2026-07-06',
      timezone: 'Asia/Karachi',
      profileRequired: false,
      onboardingRequired: false,
      hero: {
        greeting: 'Good evening, Haseeb',
        currentWeightKg: null,
        startingWeightKg: null,
        targetWeightKg: null,
        weightLostKg: null,
        remainingKg: null,
        progressPercentage: 0,
      },
      todayProgress: {
        calories: { consumed: 0, target: null, remaining: null },
        protein: { consumedGrams: 0, targetGrams: null, remainingGrams: null },
        water: { consumedMl: 0, targetMl: 3000, remainingMl: 3000 },
        steps: { count: 0, target: 8000, remaining: 8000 },
        exercise: { durationMinutes: 0, estimatedCaloriesBurned: 0 },
      },
      timeline: [],
      quickActions: ['LOG_MEAL'],
      aiFocus: {
        title: 'Start with one small win',
        message: 'Log your first meal, water, or weight update to begin today.',
        actions: [{ type: 'LOG_MEAL', label: 'Log Meal' }],
      },
      weeklyReview: { available: false, status: 'COMING_SOON' },
      rewardsPreview: { available: false, status: 'COMING_SOON' },
      consistency: { last30DaysPercentage: 0, label: 'Getting started' },
    });

    const controller = new DashboardController(dashboardService);
    const response = await controller.getToday(currentUser);

    expect(getToday).toHaveBeenCalledWith('user-id');
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: expect.objectContaining({
        date: '2026-07-06',
        timezone: 'Asia/Karachi',
      }) as object,
      meta: {},
    });
  });

  it('returns standard dashboard summary response', async () => {
    getSummary.mockResolvedValue({
      range: DashboardSummaryRange.SEVEN_DAYS,
      startDate: '2026-06-30',
      endDate: '2026-07-06',
      averageCalories: 2100,
      averageProteinGrams: 145,
      averageWaterMl: 2200,
      averageSteps: 7200,
      exerciseSessions: 5,
      totalExerciseMinutes: 180,
      weightChangeKg: -0.8,
      mealLoggingDays: 6,
      waterLoggingDays: 5,
      exerciseLoggingDays: 4,
      weightLoggingDays: 2,
      consistencyPercentage: 86,
    });

    const controller = new DashboardController(dashboardService);
    const response = await controller.getSummary(currentUser, {
      range: DashboardSummaryRange.SEVEN_DAYS,
    });

    expect(getSummary).toHaveBeenCalledWith(
      'user-id',
      DashboardSummaryRange.SEVEN_DAYS,
    );
    expect(response).toEqual({
      success: true,
      message: 'Fetched successfully',
      data: expect.objectContaining({
        range: DashboardSummaryRange.SEVEN_DAYS,
        startDate: '2026-06-30',
        endDate: '2026-07-06',
      }) as object,
      meta: {},
    });
  });
});
