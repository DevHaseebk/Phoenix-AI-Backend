import { NotFoundException } from '@nestjs/common';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const prisma = {
    user: { findMany, count, findUnique },
    subscription: { upsert },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('paginates, defaults page/limit, and maps rowless users to accessOverride:false', async () => {
      findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'haseeb@example.com',
          fullName: 'Haseeb',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          role: UserRole.ADMIN,
          subscription: {
            status: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
            accessOverride: false,
          },
        },
        {
          id: 'user-2',
          email: 'noSub@example.com',
          fullName: null,
          createdAt: new Date('2026-07-02T00:00:00.000Z'),
          role: UserRole.USER,
          subscription: null,
        },
      ]);
      count.mockResolvedValue(2);

      const service = new AdminUsersService(prisma);
      const result = await service.list({});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual({
        items: [
          {
            id: 'user-1',
            email: 'haseeb@example.com',
            fullName: 'Haseeb',
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            role: UserRole.ADMIN,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
            accessOverride: false,
          },
          {
            id: 'user-2',
            email: 'noSub@example.com',
            fullName: null,
            createdAt: new Date('2026-07-02T00:00:00.000Z'),
            role: UserRole.USER,
            subscriptionStatus: null,
            trialEndsAt: null,
            accessOverride: false,
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
      });
    });

    it('builds a search + subscription-status filter and applies custom pagination', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      const service = new AdminUsersService(prisma);
      await service.list({
        search: ' haseeb ',
        status: SubscriptionStatus.TRIALING,
        page: 3,
        limit: 10,
      });

      const expectedWhere = {
        OR: [
          { email: { contains: 'haseeb', mode: 'insensitive' } },
          { fullName: { contains: 'haseeb', mode: 'insensitive' } },
        ],
        subscription: { status: SubscriptionStatus.TRIALING },
      };

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 20,
          take: 10,
        }),
      );
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });

  describe('setAccessOverride', () => {
    it('upserts the Subscription row, creating one with the requested value when none exists', async () => {
      findUnique.mockResolvedValue({ id: 'user-1' });
      upsert.mockResolvedValue({
        userId: 'user-1',
        status: SubscriptionStatus.EXPIRED,
        accessOverride: true,
        trialEndsAt: null,
      });

      const service = new AdminUsersService(prisma);
      const result = await service.setAccessOverride('user-1', true);

      expect(upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { accessOverride: true },
        create: {
          userId: 'user-1',
          accessOverride: true,
          status: SubscriptionStatus.EXPIRED,
        },
        select: {
          userId: true,
          status: true,
          accessOverride: true,
          trialEndsAt: true,
        },
      });
      expect(result.accessOverride).toBe(true);
    });

    it('throws NotFoundException for a nonexistent user without touching Subscription', async () => {
      findUnique.mockResolvedValue(null);

      const service = new AdminUsersService(prisma);

      await expect(
        service.setAccessOverride('missing-user', true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
