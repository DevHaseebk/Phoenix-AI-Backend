import { GoalType, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardsService } from './rewards.service';

function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

interface StoredUserBadge {
  id: string;
  userId: string;
  badgeKey: string;
  unlockedAt: Date;
}

describe('RewardsService', () => {
  const userProfileFindUnique = jest.fn();
  const mealLogFindMany = jest.fn();
  const waterLogFindMany = jest.fn();
  const exerciseLogFindMany = jest.fn();
  const weightLogFindMany = jest.fn();
  const weightLogFindFirst = jest.fn();
  const aiMessageCount = jest.fn();
  const userBadgeFindMany = jest.fn();
  const userBadgeCreateMany = jest.fn();
  const notificationCreateMany = jest.fn();

  const prisma = {
    userProfile: { findUnique: userProfileFindUnique },
    mealLog: { findMany: mealLogFindMany },
    waterLog: { findMany: waterLogFindMany },
    exerciseLog: { findMany: exerciseLogFindMany },
    weightLog: {
      findMany: weightLogFindMany,
      findFirst: weightLogFindFirst,
    },
    aiMessage: { count: aiMessageCount },
    userBadge: {
      findMany: userBadgeFindMany,
      createMany: userBadgeCreateMany,
    },
    notification: { createMany: notificationCreateMany },
  } as unknown as PrismaService;

  let service: RewardsService;
  /** Stateful in-memory UserBadge table so createMany() is actually visible
   * to a subsequent findMany() within the same call, matching real Postgres
   * behavior - a plain mockResolvedValue would silently hide that. */
  let storedBadges: StoredUserBadge[];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RewardsService(prisma);
    storedBadges = [];

    userProfileFindUnique.mockResolvedValue({
      timezone: 'UTC',
      goalType: GoalType.LOSE_WEIGHT,
      currentWeightKg: 90,
      targetWeightKg: 80,
      proteinTargetGrams: 120,
    });
    mealLogFindMany.mockResolvedValue([]);
    waterLogFindMany.mockResolvedValue([]);
    exerciseLogFindMany.mockResolvedValue([]);
    weightLogFindMany.mockResolvedValue([]);
    weightLogFindFirst.mockResolvedValue(null);
    aiMessageCount.mockResolvedValue(0);
    notificationCreateMany.mockResolvedValue({ count: 0 });

    userBadgeFindMany.mockImplementation(() => Promise.resolve(storedBadges));
    userBadgeCreateMany.mockImplementation(
      ({ data }: { data: Array<{ userId: string; badgeKey: string }> }) => {
        storedBadges.push(
          ...data.map((row) => ({
            id: row.badgeKey,
            userId: row.userId,
            badgeKey: row.badgeKey,
            unlockedAt: new Date(),
          })),
        );

        return Promise.resolve({ count: data.length });
      },
    );
  });

  describe('evaluateAndUnlockBadges', () => {
    it('unlocks newly-qualifying badges and fires one notification per unlock', async () => {
      mealLogFindMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          loggedAt: utcNoon(`2026-07-0${i + 1}`),
          totalProteinGrams: 20,
        })),
      );

      const result = await service.evaluateAndUnlockBadges(
        'user-1',
        utcNoon('2026-07-13'),
      );

      const newKeys = result.newlyUnlocked.map((badge) => badge.key);
      expect(newKeys).toContain('LOGGING_MEAL_3');

      expect(userBadgeCreateMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { userId: 'user-1', badgeKey: 'LOGGING_MEAL_3' },
        ]) as object,
        skipDuplicates: true,
      });
      expect(notificationCreateMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            type: NotificationType.BADGE_UNLOCKED,
            message: expect.stringContaining('Badge unlocked') as string,
          }) as object,
        ]) as object,
      });
    });

    it('does not re-unlock or re-notify for a badge already recorded', async () => {
      mealLogFindMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          loggedAt: utcNoon(`2026-07-0${i + 1}`),
          totalProteinGrams: 20,
        })),
      );
      storedBadges.push({
        id: 'b1',
        userId: 'user-1',
        badgeKey: 'LOGGING_MEAL_3',
        unlockedAt: utcNoon('2026-07-02'),
      });

      const result = await service.evaluateAndUnlockBadges(
        'user-1',
        utcNoon('2026-07-13'),
      );

      expect(result.newlyUnlocked.map((b) => b.key)).not.toContain(
        'LOGGING_MEAL_3',
      );
      expect(userBadgeCreateMany).not.toHaveBeenCalled();
      expect(notificationCreateMany).not.toHaveBeenCalled();
    });

    it('produces no new unlocks on a second call with unchanged data (idempotent)', async () => {
      mealLogFindMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          loggedAt: utcNoon(`2026-07-0${i + 1}`),
          totalProteinGrams: 20,
        })),
      );

      const firstCall = await service.evaluateAndUnlockBadges(
        'user-1',
        utcNoon('2026-07-13'),
      );
      expect(firstCall.newlyUnlocked.length).toBeGreaterThan(0);

      notificationCreateMany.mockClear();
      userBadgeCreateMany.mockClear();

      const secondCall = await service.evaluateAndUnlockBadges(
        'user-1',
        utcNoon('2026-07-13'),
      );

      expect(secondCall.newlyUnlocked).toHaveLength(0);
      expect(userBadgeCreateMany).not.toHaveBeenCalled();
      expect(notificationCreateMany).not.toHaveBeenCalled();
      // Badges from the first call remain visible, not lost or duplicated.
      expect(secondCall.allUnlocked).toHaveLength(firstCall.allUnlocked.length);
    });
  });

  describe('getRewards', () => {
    it('returns unlocked badges with names/descriptions joined from config, and locked badges with progress', async () => {
      mealLogFindMany.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) => ({
          loggedAt: utcNoon(`2026-07-0${i + 1}`),
          totalProteinGrams: 20,
        })),
      );

      const response = await service.getRewards(
        'user-1',
        utcNoon('2026-07-13'),
      );

      const mealThreeUnlocked = response.unlocked.find(
        (badge) => badge.key === 'LOGGING_MEAL_3',
      );
      expect(mealThreeUnlocked).toMatchObject({
        key: 'LOGGING_MEAL_3',
        category: 'LOGGING_COUNT',
        name: 'First Steps: Meal Logging',
      });
      expect(mealThreeUnlocked?.unlockedAt).toBeTruthy();

      const mealTenLocked = response.locked.find(
        (badge) => badge.key === 'LOGGING_MEAL_10',
      );
      expect(mealTenLocked).toMatchObject({
        key: 'LOGGING_MEAL_10',
        progress: '3/10',
        progressPercentage: 30,
      });
    });
  });

  describe('getMilestones', () => {
    it('builds milestones from the earliest weight log as the start weight', async () => {
      userProfileFindUnique.mockResolvedValue({
        goalType: GoalType.LOSE_WEIGHT,
        currentWeightKg: 92,
        targetWeightKg: 80,
      });
      weightLogFindFirst.mockResolvedValue({ weightKg: 100 });

      const milestones = await service.getMilestones('user-1');

      expect(milestones.length).toBeGreaterThan(0);
      expect(milestones[milestones.length - 1].targetWeightKg).toBe(80);
    });

    it('returns an empty array when the user has no profile yet', async () => {
      userProfileFindUnique.mockResolvedValue(null);

      const milestones = await service.getMilestones('user-1');

      expect(milestones).toEqual([]);
    });
  });
});
