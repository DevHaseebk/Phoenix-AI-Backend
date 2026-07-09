import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiMessageRole,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { getTodayRangeForTimezone } from '../../dashboard/dashboard-timezone';
import { DashboardService } from '../../dashboard/dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { detectNudgeLanguage, renderNudgeTemplate } from './nudge-templates';
import {
  applyDailyCap,
  applyFatigueSuppression,
  evaluateNudgeRules,
  nudgeThresholds,
  type NudgeType,
} from './nudge-rules.util';
import { UserStateService } from '../user-state/user-state.service';

const fallbackTimezone = 'Asia/Karachi';

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  message: string;
  status: NotificationStatus;
  createdAt: Date;
}

@Injectable()
export class NudgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly userStateService: UserStateService,
  ) {}

  /**
   * MVP trigger mechanism: no scheduler/job queue exists in this app, so
   * nudges are generated "just in time" whenever the frontend asks for the
   * notification list, not on a fixed schedule. See docs/13_AI_Features_Implemented.md
   * for the documented recommendation to move this to a real scheduled job.
   */
  async getNotificationsForUser(
    userId: string,
    now = new Date(),
  ): Promise<NotificationResponse[]> {
    await this.generateTodaysNudges(userId, now);

    return this.prisma.notification.findMany({
      where: { userId, status: { not: NotificationStatus.DISMISSED } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        message: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.ensureOwnedNotification(userId, id);
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ },
      select: { id: true },
    });
  }

  async markDismissed(userId: string, id: string): Promise<void> {
    await this.ensureOwnedNotification(userId, id);
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.DISMISSED },
      select: { id: true },
    });
  }

  private async ensureOwnedNotification(
    userId: string,
    id: string,
  ): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
  }

  private async generateTodaysNudges(userId: string, now: Date): Promise<void> {
    const [profile, latestWeightLog, today, statusesByType] = await Promise.all(
      [
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: {
            timezone: true,
            currentWeightKg: true,
            targetWeightKg: true,
          },
        }),
        this.prisma.weightLog.findFirst({
          where: { userId },
          orderBy: { loggedAt: 'desc' },
          select: { loggedAt: true },
        }),
        this.dashboardService.getToday(userId, now),
        this.getRecentStatusesByType(userId),
      ],
    );

    const timezone = profile?.timezone ?? fallbackTimezone;
    const todayRange = getTodayRangeForTimezone(timezone, now);
    const userState = await this.userStateService.determineForUser(
      userId,
      {
        hasMedicalRiskFlag: false,
        bmrKcal: null,
        currentWeightKg: profile?.currentWeightKg
          ? Number(profile.currentWeightKg)
          : null,
        targetWeightKg: profile?.targetWeightKg
          ? Number(profile.targetWeightKg)
          : null,
      },
      now,
    );

    const daysSinceLastWeightLog = latestWeightLog
      ? Math.floor(
          (now.getTime() - latestWeightLog.loggedAt.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

    const ruleHits = evaluateNudgeRules({
      userState: userState.state,
      daysSinceLastWeightLog,
      hasMealLoggedToday: today.timeline.length > 0,
      currentLocalHour: todayRange.localHour,
      waterRemainingMl: today.todayProgress.water.remainingMl,
    });
    const afterFatigue = applyFatigueSuppression(ruleHits, statusesByType);

    const [alreadyCreatedToday, existingTypesToday] =
      await this.getTodaysNotifications(
        userId,
        todayRange.startUtc,
        todayRange.endUtc,
      );
    const newTypes = applyDailyCap(
      afterFatigue.filter((type) => !existingTypesToday.has(type)),
      alreadyCreatedToday,
    );

    if (newTypes.length === 0) {
      return;
    }

    const recentUserMessage = await this.prisma.aiMessage.findFirst({
      where: { userId, role: AiMessageRole.USER },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    const language = detectNudgeLanguage(recentUserMessage?.content);

    await this.prisma.notification.createMany({
      data: newTypes.map((type) => ({
        userId,
        type,
        message: renderNudgeTemplate(type, language),
      })),
    });
  }

  private async getRecentStatusesByType(
    userId: string,
  ): Promise<Partial<Record<NudgeType, NotificationStatus[]>>> {
    const types = Object.values(NotificationType);
    const results = await Promise.all(
      types.map((type) =>
        this.prisma.notification.findMany({
          where: { userId, type },
          orderBy: { createdAt: 'desc' },
          take: nudgeThresholds.fatigueLookbackCount,
          select: { status: true },
        }),
      ),
    );

    return Object.fromEntries(
      types.map((type, index) => [
        type,
        results[index].map((row) => row.status),
      ]),
    );
  }

  private async getTodaysNotifications(
    userId: string,
    startUtc: Date,
    endUtc: Date,
  ): Promise<[number, Set<NudgeType>]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, createdAt: { gte: startUtc, lte: endUtc } },
      select: { type: true },
    });

    return [rows.length, new Set(rows.map((row) => row.type))];
  }
}
