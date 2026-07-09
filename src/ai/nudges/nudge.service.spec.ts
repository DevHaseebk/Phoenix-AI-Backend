import { NotFoundException } from '@nestjs/common';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { DashboardService } from '../../dashboard/dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStateService } from '../user-state/user-state.service';
import { NudgeService } from './nudge.service';

describe('NudgeService', () => {
  const now = new Date('2026-07-08T15:00:00.000Z'); // afternoon, Asia/Karachi

  const profileFindUnique = jest.fn();
  const weightLogFindFirst = jest.fn();
  const notificationFindMany = jest.fn();
  const notificationFindFirst = jest.fn();
  const notificationCreateMany = jest.fn();
  const notificationUpdate = jest.fn();
  const aiMessageFindFirst = jest.fn();
  const prisma = {
    userProfile: { findUnique: profileFindUnique },
    weightLog: { findFirst: weightLogFindFirst },
    notification: {
      findMany: notificationFindMany,
      findFirst: notificationFindFirst,
      createMany: notificationCreateMany,
      update: notificationUpdate,
    },
    aiMessage: { findFirst: aiMessageFindFirst },
  } as unknown as PrismaService;

  const dashboardGetToday = jest.fn();
  const dashboardService = {
    getToday: dashboardGetToday,
  } as unknown as DashboardService;

  const determineForUser = jest.fn();
  const userStateService = {
    determineForUser,
  } as unknown as UserStateService;

  function createService(): NudgeService {
    return new NudgeService(prisma, dashboardService, userStateService);
  }

  function getCreatedNotifications(): Array<{
    userId: string;
    type: NotificationType;
    message: string;
  }> {
    const calls = notificationCreateMany.mock.calls as Array<
      [
        {
          data: Array<{
            userId: string;
            type: NotificationType;
            message: string;
          }>;
        },
      ]
    >;

    return calls[0][0].data;
  }

  function mockToday(overrides: {
    hasMealToday?: boolean;
    waterRemainingMl?: number;
  }) {
    dashboardGetToday.mockResolvedValue({
      timeline: overrides.hasMealToday ? [{ id: 'meal-1' }] : [],
      todayProgress: {
        water: { remainingMl: overrides.waterRemainingMl ?? 2000 },
      },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    profileFindUnique.mockResolvedValue({
      timezone: 'Asia/Karachi',
      currentWeightKg: 80,
      targetWeightKg: 70,
    });
    weightLogFindFirst.mockResolvedValue({ loggedAt: now }); // logged today by default
    mockToday({ hasMealToday: true, waterRemainingMl: 2000 });
    determineForUser.mockResolvedValue({
      state: 'ACTIVE_USER',
      reason: 'on track',
    });
    notificationFindMany.mockImplementation(
      ({ where }: { where?: { createdAt?: unknown } }) => {
        // Distinguish the "recent statuses per type" calls (take set, no createdAt
        // filter) from the "already created today" call (createdAt range filter).
        if (where?.createdAt) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
    notificationCreateMany.mockResolvedValue({ count: 0 });
    aiMessageFindFirst.mockResolvedValue(null);
  });

  describe('getNotificationsForUser', () => {
    it('generates nothing and returns [] for an on-track Active User (Smart Silence)', async () => {
      const service = createService();
      const result = await service.getNotificationsForUser('user-id', now);

      expect(notificationCreateMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('creates a WEIGHT_UPDATE_DUE notification when the last weight log is old', async () => {
      weightLogFindFirst.mockResolvedValue({
        loggedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      });

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      expect(notificationCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: 'user-id',
            type: NotificationType.WEIGHT_UPDATE_DUE,
          }) as object,
        ],
      });
    });

    it('creates a COMEBACK_WELCOME notification when the state engine resolves to COMEBACK', async () => {
      determineForUser.mockResolvedValue({
        state: 'COMEBACK',
        reason: 'returned today',
      });

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      expect(notificationCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            type: NotificationType.COMEBACK_WELCOME,
          }) as object,
        ],
      });
    });

    it('caps candidates at 3/day, keeping the highest-priority types', async () => {
      // Trigger all 4 rules at once: Comeback, old weight, no meal past 2pm, water close.
      determineForUser.mockResolvedValue({ state: 'COMEBACK', reason: 'x' });
      weightLogFindFirst.mockResolvedValue({
        loggedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      });
      mockToday({ hasMealToday: false, waterRemainingMl: 500 });

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      const created = getCreatedNotifications();

      expect(created).toHaveLength(3);
      expect(created.map((row) => row.type)).toEqual([
        NotificationType.COMEBACK_WELCOME,
        NotificationType.WEIGHT_UPDATE_DUE,
        NotificationType.MEAL_LOGGING_GAP,
      ]);
    });

    it('does not create a duplicate notification of a type already created today', async () => {
      weightLogFindFirst.mockResolvedValue({
        loggedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      });
      notificationFindMany.mockImplementation(
        ({ where }: { where?: { createdAt?: unknown } }) => {
          if (where?.createdAt) {
            return Promise.resolve([
              { type: NotificationType.WEIGHT_UPDATE_DUE },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      expect(notificationCreateMany).not.toHaveBeenCalled();
    });

    it('suppresses a type whose last 3 notifications were all ignored (fatigue rule)', async () => {
      weightLogFindFirst.mockResolvedValue({
        loggedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      });
      notificationFindMany.mockImplementation(
        ({
          where,
        }: {
          where?: { createdAt?: unknown; type?: NotificationType };
        }) => {
          if (where?.createdAt) {
            return Promise.resolve([]);
          }
          if (where?.type === NotificationType.WEIGHT_UPDATE_DUE) {
            return Promise.resolve([
              { status: NotificationStatus.UNREAD },
              { status: NotificationStatus.DISMISSED },
              { status: NotificationStatus.UNREAD },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      expect(notificationCreateMany).not.toHaveBeenCalled();
    });

    it('picks the Roman Urdu template when the user recently wrote in Roman Urdu', async () => {
      weightLogFindFirst.mockResolvedValue({
        loggedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      });
      aiMessageFindFirst.mockResolvedValue({
        content: 'mein aaj kya karoon, kya aap bata sakte hain',
      });

      const service = createService();
      await service.getNotificationsForUser('user-id', now);

      const created = getCreatedNotifications();

      expect(created[0].message).toContain('Weight update ka din hai');
    });
  });

  describe('ownership checks', () => {
    it('marks an owned notification as read', async () => {
      notificationFindFirst.mockResolvedValue({ id: 'notif-1' });
      const service = createService();

      await service.markRead('user-1', 'notif-1');

      expect(notificationUpdate).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { status: NotificationStatus.READ },
        select: { id: true },
      });
    });

    it('marks an owned notification as dismissed', async () => {
      notificationFindFirst.mockResolvedValue({ id: 'notif-1' });
      const service = createService();

      await service.markDismissed('user-1', 'notif-1');

      expect(notificationUpdate).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { status: NotificationStatus.DISMISSED },
        select: { id: true },
      });
    });

    it('rejects marking read a notification owned by another user', async () => {
      notificationFindFirst.mockResolvedValue(null);
      const service = createService();

      await expect(
        service.markRead('user-a', 'notif-owned-by-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(notificationUpdate).not.toHaveBeenCalled();
    });

    it('rejects dismissing a notification owned by another user', async () => {
      notificationFindFirst.mockResolvedValue(null);
      const service = createService();

      await expect(
        service.markDismissed('user-a', 'notif-owned-by-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(notificationUpdate).not.toHaveBeenCalled();
    });
  });
});
