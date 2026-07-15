import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListInternalUsersQueryDto } from './dto/list-internal-users-query.dto';

export interface InternalUserListItem {
  id: string;
  email: string | null;
  fullName: string | null;
  createdAt: Date;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  accessOverride: boolean;
}

@Injectable()
export class InternalUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListInternalUsersQueryDto): Promise<{
    items: InternalUserListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

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
        subscriptionStatus: user.subscription?.status ?? null,
        trialEndsAt: user.subscription?.trialEndsAt ?? null,
        accessOverride: user.subscription?.accessOverride ?? false,
      })),
      total,
      page,
      limit,
    };
  }

  async setAccessOverride(userId: string, accessOverride: boolean) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('User has no subscription record');
    }

    return this.prisma.subscription.update({
      where: { userId },
      data: { accessOverride },
      select: {
        userId: true,
        status: true,
        accessOverride: true,
        trialEndsAt: true,
      },
    });
  }
}
