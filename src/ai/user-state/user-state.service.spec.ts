import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStateService } from './user-state.service';

describe('UserStateService', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');
  const onboardingFindUnique = jest.fn();
  const profileFindUnique = jest.fn();
  const weightLogFindMany = jest.fn();
  const weightLogCount = jest.fn();
  const waterLogFindMany = jest.fn();
  const waterLogCount = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const exerciseLogCount = jest.fn();
  const mealLogFindMany = jest.fn();
  const mealLogCount = jest.fn();
  const prisma = {
    userOnboarding: { findUnique: onboardingFindUnique },
    userProfile: { findUnique: profileFindUnique },
    weightLog: { findMany: weightLogFindMany, count: weightLogCount },
    waterLog: { findMany: waterLogFindMany, count: waterLogCount },
    exerciseLog: { findMany: exerciseLogFindMany, count: exerciseLogCount },
    mealLog: { findMany: mealLogFindMany, count: mealLogCount },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    onboardingFindUnique.mockResolvedValue({
      completedAt: new Date('2026-04-01'),
    });
    profileFindUnique.mockResolvedValue({ timezone: 'Asia/Karachi' });
    weightLogFindMany.mockResolvedValue([]);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    mealLogFindMany.mockResolvedValue([]);
    weightLogCount.mockResolvedValue(0);
    waterLogCount.mockResolvedValue(0);
    exerciseLogCount.mockResolvedValue(0);
    mealLogCount.mockResolvedValue(0);
  });

  it('classifies ACTIVE_USER when the most recent activity is today', async () => {
    mealLogFindMany.mockImplementation((args: { take?: number }) =>
      Promise.resolve(
        args?.take
          ? [{ loggedAt: now }]
          : [{ totalCalories: new Prisma.Decimal('1800'), loggedAt: now }],
      ),
    );
    mealLogCount.mockResolvedValue(20);

    const service = new UserStateService(prisma);
    const result = await service.determineForUser(
      'user-id',
      {
        hasMedicalRiskFlag: false,
        bmrKcal: 1800,
        currentWeightKg: 80,
        targetWeightKg: 60,
      },
      now,
    );

    expect(result.state).toBe('ACTIVE_USER');
  });

  it('classifies HIGH_RISK when no logs exist at all', async () => {
    const service = new UserStateService(prisma);
    const result = await service.determineForUser(
      'user-id',
      {
        hasMedicalRiskFlag: false,
        bmrKcal: 1800,
        currentWeightKg: 80,
        targetWeightKg: 60,
      },
      now,
    );

    expect(result.state).toBe('HIGH_RISK');
  });

  it('bypasses all data fetching and returns HIGH_RISK immediately on a medical risk flag', async () => {
    const service = new UserStateService(prisma);
    const result = await service.determineForUser(
      'user-id',
      {
        hasMedicalRiskFlag: true,
        bmrKcal: null,
        currentWeightKg: null,
        targetWeightKg: null,
      },
      now,
    );

    expect(result.state).toBe('HIGH_RISK');
    expect(result.reason).toMatch(/safety flag/i);
  });
});
