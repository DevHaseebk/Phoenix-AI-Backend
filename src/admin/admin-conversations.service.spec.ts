import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminConversationsService } from './admin-conversations.service';

describe('AdminConversationsService', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    aiConversation: { findMany, count, findUnique },
  } as unknown as PrismaService;
  const record = jest.fn();
  const auditLog = { record } as unknown as AuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('never exposes message content, only counts/metadata', async () => {
      findMany.mockResolvedValue([
        {
          id: 'conv-1',
          userId: 'user-1',
          title: 'Chat',
          type: 'COACHING',
          status: 'ACTIVE',
          createdAt: new Date('2026-07-01'),
          updatedAt: new Date('2026-07-02'),
          user: { email: 'a@example.com', fullName: 'A User' },
          _count: { messages: 5 },
        },
      ]);
      count.mockResolvedValue(1);
      const service = new AdminConversationsService(prisma, auditLog);

      const result = await service.list({});

      expect(result.items[0]).toEqual({
        id: 'conv-1',
        userId: 'user-1',
        userEmail: 'a@example.com',
        userFullName: 'A User',
        title: 'Chat',
        type: 'COACHING',
        status: 'ACTIVE',
        messageCount: 5,
        lastActivityAt: new Date('2026-07-02'),
        createdAt: new Date('2026-07-01'),
      });
      expect(JSON.stringify(result)).not.toContain('content');
    });

    it('filters by a case-insensitive email substring when search is given', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const service = new AdminConversationsService(prisma, auditLog);

      await service.list({ search: ' haseeb ' });

      const expectedWhere = {
        user: { email: { contains: 'haseeb', mode: 'insensitive' } },
      };
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('paginates using page/limit', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const service = new AdminConversationsService(prisma, auditLog);

      await service.list({ page: 3, limit: 10 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('getById', () => {
    it('returns the full message history', async () => {
      findUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Chat',
        type: 'COACHING',
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-02'),
        user: { email: 'a@example.com', fullName: 'A User' },
        messages: [
          { id: 'msg-1', role: 'USER', content: 'hi', createdAt: new Date() },
        ],
      });
      const service = new AdminConversationsService(prisma, auditLog);

      const result = await service.getById('conv-1', 'admin-1');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('hi');
    });

    it('records an AuditLogEntry for the view, every time it is called', async () => {
      findUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Chat',
        type: 'COACHING',
        status: 'ACTIVE',
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-02'),
        user: { email: 'a@example.com', fullName: 'A User' },
        messages: [],
      });
      const service = new AdminConversationsService(prisma, auditLog);

      await service.getById('conv-1', 'admin-1');

      expect(record).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'conversation.view',
        targetType: 'AiConversation',
        targetId: 'conv-1',
        metadata: {
          conversationUserId: 'user-1',
          conversationUserEmail: 'a@example.com',
          messageCount: 0,
        },
      });
    });

    it('throws NotFoundException and does NOT record an audit entry for a missing conversation', async () => {
      findUnique.mockResolvedValue(null);
      const service = new AdminConversationsService(prisma, auditLog);

      await expect(
        service.getById('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(record).not.toHaveBeenCalled();
    });
  });
});
