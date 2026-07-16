import { Injectable } from '@nestjs/common';
import { SubscriptionStatus, UnknownFoodQueueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminStats {
  totalUsers: number;
  trialingUsers: number;
  activeUsers: number;
  signupsLast7Days: number;
  pendingUnknownFoods: number;
}

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now = new Date()): Promise<AdminStats> {
    const sevenDaysAgo = new Date(now.getTime() - sevenDaysMs);

    const [
      totalUsers,
      trialingUsers,
      activeUsers,
      signupsLast7Days,
      pendingUnknownFoods,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.TRIALING },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.unknownFoodQueueItem.count({
        where: { status: UnknownFoodQueueStatus.PENDING },
      }),
    ]);

    return {
      totalUsers,
      trialingUsers,
      activeUsers,
      signupsLast7Days,
      pendingUnknownFoods,
    };
  }
}
