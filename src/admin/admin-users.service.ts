import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';

export interface AdminUserListItem {
  id: string;
  email: string | null;
  fullName: string | null;
  createdAt: Date;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  accessOverride: boolean;
}

export interface AdminUserAccessOverrideResult {
  userId: string;
  status: SubscriptionStatus;
  accessOverride: boolean;
  trialEndsAt: Date | null;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminUsersQueryDto): Promise<{
    items: AdminUserListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { fullName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { subscription: { status: query.status } } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          createdAt: true,
          role: true,
          subscription: {
            select: {
              status: true,
              trialEndsAt: true,
              accessOverride: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        createdAt: user.createdAt,
        role: user.role,
        subscriptionStatus: user.subscription?.status ?? null,
        trialEndsAt: user.subscription?.trialEndsAt ?? null,
        accessOverride: user.subscription?.accessOverride ?? false,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Upserts by userId rather than requiring an existing Subscription row -
   * legacy pre-billing accounts (see docs/16 §5's "Subscription webhook
   * fix" note) have none, and the whole point of this toggle is to let an
   * admin comp exactly those accounts rather than fail on them. A freshly
   * created row uses the requested accessOverride value (not hardcoded
   * true) so the endpoint is a real toggle even for a rowless user's first
   * call; `status: EXPIRED` mirrors SubscriptionAccessService.getStatus()'s
   * own synthetic default for a rowless user - accessOverride:true already
   * yields FULL_UNLIMITED regardless of status, so this is purely for a
   * sane persisted value, not something access logic branches on.
   */
  async setAccessOverride(
    userId: string,
    accessOverride: boolean,
  ): Promise<AdminUserAccessOverrideResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.subscription.upsert({
      where: { userId },
      update: { accessOverride },
      create: {
        userId,
        accessOverride,
        status: SubscriptionStatus.EXPIRED,
      },
      select: {
        userId: true,
        status: true,
        accessOverride: true,
        trialEndsAt: true,
      },
    });
  }
}
