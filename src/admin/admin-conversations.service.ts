import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiConversationStatus,
  AiConversationType,
  AiMessageRole,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminConversationsQueryDto } from './dto/list-admin-conversations-query.dto';

export interface AdminConversationListItem {
  id: string;
  userId: string;
  userEmail: string | null;
  userFullName: string | null;
  title: string | null;
  type: AiConversationType;
  status: AiConversationStatus;
  messageCount: number;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface AdminConversationMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  createdAt: Date;
}

export interface AdminConversationDetail {
  id: string;
  userId: string;
  userEmail: string | null;
  userFullName: string | null;
  title: string | null;
  type: AiConversationType;
  status: AiConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  messages: AdminConversationMessage[];
}

/**
 * Support/debugging viewer over real user AI conversations - inherently
 * privacy-sensitive (this is the one place in admin/ that reads another
 * user's actual message content, not just structured business data), so
 * every detail view is itself an audited action (see getById()), not just
 * mutations. List/search never expose message content, only counts/
 * metadata - content is only ever returned by getById() for one specific,
 * audited conversation.
 */
@Injectable()
export class AdminConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: ListAdminConversationsQueryDto): Promise<{
    items: AdminConversationListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where = search
      ? { user: { email: { contains: search, mode: 'insensitive' as const } } }
      : {};

    const [conversations, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          title: true,
          type: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true, fullName: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.aiConversation.count({ where }),
    ]);

    return {
      items: conversations.map((conversation) => ({
        id: conversation.id,
        userId: conversation.userId,
        userEmail: conversation.user.email,
        userFullName: conversation.user.fullName,
        title: conversation.title,
        type: conversation.type,
        status: conversation.status,
        messageCount: conversation._count.messages,
        lastActivityAt: conversation.updatedAt,
        createdAt: conversation.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Records an AuditLogEntry EVERY time this is called, before returning -
   * viewing private user message content is itself the action being
   * audited, per the task's explicit instruction ("viewing private user
   * data should itself be an audited action, not just mutations").
   */
  async getById(
    id: string,
    adminUserId: string,
  ): Promise<AdminConversationDetail> {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, fullName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.auditLog.record({
      adminUserId,
      action: 'conversation.view',
      targetType: 'AiConversation',
      targetId: id,
      metadata: {
        conversationUserId: conversation.userId,
        conversationUserEmail: conversation.user.email,
        messageCount: conversation.messages.length,
      },
    });

    return {
      id: conversation.id,
      userId: conversation.userId,
      userEmail: conversation.user.email,
      userFullName: conversation.user.fullName,
      title: conversation.title,
      type: conversation.type,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages,
    };
  }
}
