import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const prisma = {
    auditLogEntry: { create, findMany, count },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('record', () => {
    it('writes an AuditLogEntry with the given fields', async () => {
      const service = new AuditLogService(prisma);

      await service.record({
        adminUserId: 'admin-1',
        action: 'user.access-override.update',
        targetType: 'User',
        targetId: 'user-1',
        metadata: { before: false, after: true },
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          adminUserId: 'admin-1',
          action: 'user.access-override.update',
          targetType: 'User',
          targetId: 'user-1',
          metadata: { before: false, after: true },
        },
      });
    });

    it('defaults metadata to JsonNull when omitted', async () => {
      const service = new AuditLogService(prisma);

      await service.record({
        adminUserId: 'admin-1',
        action: 'rag-document.approve',
        targetType: 'RagDocument',
        targetId: 'doc-1',
      });

      const calls = create.mock.calls as Array<
        [{ data: { metadata: unknown } }]
      >;
      expect(calls[0][0].data.metadata).toBe(Prisma.JsonNull);
    });
  });

  describe('list', () => {
    it('paginates and defaults page/limit', async () => {
      findMany.mockResolvedValue([
        {
          id: 'entry-1',
          adminUserId: 'admin-1',
          action: 'user.access-override.update',
          targetType: 'User',
          targetId: 'user-1',
          metadata: { before: false, after: true },
          createdAt: new Date('2026-07-21T00:00:00.000Z'),
          adminUser: { email: 'admin@example.com', fullName: 'Admin' },
        },
      ]);
      count.mockResolvedValue(1);
      const service = new AuditLogService(prisma);

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
            id: 'entry-1',
            adminUserId: 'admin-1',
            adminUserEmail: 'admin@example.com',
            adminUserName: 'Admin',
            action: 'user.access-override.update',
            targetType: 'User',
            targetId: 'user-1',
            metadata: { before: false, after: true },
            createdAt: new Date('2026-07-21T00:00:00.000Z'),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('builds filters for adminUserId/action/targetType/date range', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const service = new AuditLogService(prisma);

      await service.list({
        adminUserId: 'admin-1',
        action: 'food-item.edit',
        targetType: 'FoodItem',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-21T00:00:00.000Z',
        page: 2,
        limit: 10,
      });

      const expectedWhere = {
        adminUserId: 'admin-1',
        action: 'food-item.edit',
        targetType: 'FoodItem',
        createdAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-21T00:00:00.000Z'),
        },
      };

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 10,
          take: 10,
        }),
      );
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });
});
