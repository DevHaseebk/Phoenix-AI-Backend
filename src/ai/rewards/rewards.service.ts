import { Injectable } from '@nestjs/common';
import { AiMessageRole, NotificationType, UserBadge } from '@prisma/client';
import { waterTargetMl } from '../../dashboard/dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  badgeDefinitionsByKey,
  type BadgeCategory,
  type BadgeDefinition,
} from './badge-definitions';
import {
  buildLockedBadgeProgress,
  evaluateNewlyUnlockedBadges,
} from './rewards-engine.util';
import {
  buildWeightMilestones,
  type WeightMilestone,
} from './rewards-milestones.util';
import {
  computeUserBadgeMetrics,
  type UserBadgeMetrics,
} from './rewards-metrics.util';

const fallbackTimezone = 'Asia/Karachi';

export interface UnlockedBadgeResponse {
  key: string;
  category: BadgeCategory;
  name: string;
  description: string;
  unlockedAt: string;
}

export interface LockedBadgeResponse {
  key: string;
  category: BadgeCategory;
  name: string;
  description: string;
  progress: string;
  progressPercentage: number;
}

export interface RewardsResponse {
  unlocked: UnlockedBadgeResponse[];
  locked: LockedBadgeResponse[];
}

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRewards(userId: string, now = new Date()): Promise<RewardsResponse> {
    const { metrics, allUnlocked } = await this.evaluateAndUnlockBadges(
      userId,
      now,
    );
    const unlockedKeys = new Set(allUnlocked.map((row) => row.badgeKey));

    const unlocked: UnlockedBadgeResponse[] = allUnlocked
      .map((row) => {
        const badge = badgeDefinitionsByKey.get(row.badgeKey);

        if (!badge) {
          return null;
        }

        return {
          key: badge.key,
          category: badge.category,
          name: badge.name,
          description: badge.description,
          unlockedAt: row.unlockedAt.toISOString(),
        };
      })
      .filter((entry): entry is UnlockedBadgeResponse => entry !== null)
      .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));

    const locked: LockedBadgeResponse[] = buildLockedBadgeProgress(
      metrics,
      unlockedKeys,
    ).map((badge) => ({
      key: badge.key,
      category: badge.category,
      name: badge.name,
      description: badge.description,
      progress: badge.progressLabel,
      progressPercentage: badge.progressPercentage,
    }));

    return { unlocked, locked };
  }

  async getMilestones(userId: string): Promise<WeightMilestone[]> {
    const [profile, earliestWeightLog, latestWeightLog] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: {
          goalType: true,
          currentWeightKg: true,
          targetWeightKg: true,
        },
      }),
      this.prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'asc' },
        select: { weightKg: true },
      }),
      this.prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        select: { weightKg: true },
      }),
    ]);

    if (!profile) {
      return [];
    }

    const startWeightKg =
      toNullableNumber(earliestWeightLog?.weightKg) ??
      toNullableNumber(profile.currentWeightKg);
    // Latest logged weight wins over the profile's stored snapshot, matching
    // dashboard.service.ts's getToday() precedence (see firstNumber() there)
    // - never a second "what is current weight" definition.
    const currentWeightKg =
      toNullableNumber(latestWeightLog?.weightKg) ??
      toNullableNumber(profile.currentWeightKg);

    return buildWeightMilestones({
      goalType: profile.goalType,
      startWeightKg,
      currentWeightKg,
      targetWeightKg: toNullableNumber(profile.targetWeightKg),
    });
  }

  /**
   * Computes metrics, unlocks any newly-qualifying badges (idempotent -
   * skipDuplicates guards a badge already unlocked by an earlier/concurrent
   * call), and fires one notification per new unlock using the exact same
   * Notification createMany pattern ai/nudges/nudge.service.ts uses - not a
   * second notification mechanism. Returns the full metrics plus every
   * UserBadge row the user now holds, so getRewards() needs no second query.
   */
  async evaluateAndUnlockBadges(
    userId: string,
    now = new Date(),
  ): Promise<{
    metrics: UserBadgeMetrics;
    newlyUnlocked: BadgeDefinition[];
    allUnlocked: UserBadge[];
  }> {
    const [
      profile,
      mealLogs,
      waterLogs,
      exerciseLogs,
      weightLogs,
      totalChatMessages,
      existingBadges,
    ] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: {
          timezone: true,
          goalType: true,
          currentWeightKg: true,
          targetWeightKg: true,
          proteinTargetGrams: true,
        },
      }),
      this.prisma.mealLog.findMany({
        where: { userId },
        select: { loggedAt: true, totalProteinGrams: true },
      }),
      this.prisma.waterLog.findMany({
        where: { userId },
        select: { loggedAt: true, amountMl: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: { userId },
        select: { loggedAt: true, durationMinutes: true, distanceKm: true },
      }),
      this.prisma.weightLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'asc' },
        select: { loggedAt: true, weightKg: true },
      }),
      this.prisma.aiMessage.count({
        where: { userId, role: AiMessageRole.USER },
      }),
      this.prisma.userBadge.findMany({ where: { userId } }),
    ]);

    const timezone = profile?.timezone ?? fallbackTimezone;
    const startWeightKg =
      weightLogs.length > 0 ? Number(weightLogs[0].weightKg) : null;
    const currentWeightKg =
      weightLogs.length > 0
        ? Number(weightLogs[weightLogs.length - 1].weightKg)
        : toNullableNumber(profile?.currentWeightKg);

    const metrics = computeUserBadgeMetrics({
      timezone,
      now,
      goalType: profile?.goalType ?? null,
      startWeightKg,
      currentWeightKg,
      targetWeightKg: toNullableNumber(profile?.targetWeightKg),
      proteinTargetGrams: toNullableNumber(profile?.proteinTargetGrams),
      waterTargetMl,
      mealLogs: mealLogs.map((log) => ({
        loggedAt: log.loggedAt,
        totalProteinGrams: Number(log.totalProteinGrams),
      })),
      waterLogs,
      exerciseLogs: exerciseLogs.map((log) => ({
        loggedAt: log.loggedAt,
        durationMinutes: log.durationMinutes,
        distanceKm: toNullableNumber(log.distanceKm),
      })),
      weightLogs,
      totalChatMessages,
    });

    const alreadyUnlockedKeys = new Set(
      existingBadges.map((badge) => badge.badgeKey),
    );
    const newlyUnlocked = evaluateNewlyUnlockedBadges(
      metrics,
      alreadyUnlockedKeys,
    );

    if (newlyUnlocked.length === 0) {
      return { metrics, newlyUnlocked, allUnlocked: existingBadges };
    }

    await this.prisma.userBadge.createMany({
      data: newlyUnlocked.map((badge) => ({ userId, badgeKey: badge.key })),
      skipDuplicates: true,
    });
    await this.prisma.notification.createMany({
      data: newlyUnlocked.map((badge) => ({
        userId,
        type: NotificationType.BADGE_UNLOCKED,
        message: `🏆 Badge unlocked: ${badge.name}!`,
      })),
    });

    const allUnlocked = await this.prisma.userBadge.findMany({
      where: { userId },
    });

    return { metrics, newlyUnlocked, allUnlocked };
  }
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
