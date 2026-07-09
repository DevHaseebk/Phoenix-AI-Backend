import { Injectable } from '@nestjs/common';
import { getLocalDateForTimezone } from '../../dashboard/dashboard-timezone';
import { PrismaService } from '../../prisma/prisma.service';
import {
  determineUserState,
  type DailyCalorieTotal,
  type UserStateInput,
  type UserStateResult,
} from './user-state.util';

const weightTrendWindowDays = 28;
const dailyCaloriesWindowDays = 7;
const fallbackTimezone = 'Asia/Karachi';

export interface UserStateContextInput {
  hasMedicalRiskFlag: boolean;
  bmrKcal: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
}

@Injectable()
export class UserStateService {
  constructor(private readonly prisma: PrismaService) {}

  async determineForUser(
    userId: string,
    input: UserStateContextInput,
    now = new Date(),
  ): Promise<UserStateResult> {
    const weightTrendStart = new Date(
      now.getTime() - weightTrendWindowDays * 24 * 60 * 60 * 1000,
    );
    const dailyCaloriesStart = new Date(
      now.getTime() - dailyCaloriesWindowDays * 24 * 60 * 60 * 1000,
    );

    const [
      onboarding,
      timezoneProfile,
      recentWeightLogs,
      recentMealLogs,
      latestActivityDates,
    ] = await Promise.all([
      this.prisma.userOnboarding.findUnique({
        where: { userId },
        select: { completedAt: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { timezone: true },
      }),
      this.prisma.weightLog.findMany({
        where: { userId, loggedAt: { gte: weightTrendStart } },
        orderBy: { loggedAt: 'desc' },
        select: { weightKg: true, loggedAt: true },
      }),
      this.prisma.mealLog.findMany({
        where: { userId, loggedAt: { gte: dailyCaloriesStart } },
        select: { totalCalories: true, loggedAt: true },
      }),
      this.getRecentActivityDates(userId),
    ]);

    const timezone = timezoneProfile?.timezone ?? fallbackTimezone;
    const totalLogCountSinceOnboarding = onboarding?.completedAt
      ? await this.countLogsSince(userId, onboarding.completedAt)
      : 0;

    const stateInput: UserStateInput = {
      now,
      hasMedicalRiskFlag: input.hasMedicalRiskFlag,
      onboardingCompletedAt: onboarding?.completedAt ?? null,
      lastActivityAt: latestActivityDates[0] ?? null,
      previousActivityAt: latestActivityDates[1] ?? null,
      recentWeightLogs: recentWeightLogs.map((log) => ({
        weightKg: Number(log.weightKg),
        loggedAt: log.loggedAt,
      })),
      recentDailyCalories: bucketDailyCalories(recentMealLogs, timezone),
      currentWeightKg: input.currentWeightKg,
      targetWeightKg: input.targetWeightKg,
      bmrKcal: input.bmrKcal,
      totalLogCountSinceOnboarding,
    };

    return determineUserState(stateInput);
  }

  /** Top 2 most recent loggedAt timestamps across all four log types, newest first. */
  private async getRecentActivityDates(userId: string): Promise<Date[]> {
    const take = 2;
    const [weightLogs, waterLogs, exerciseLogs, mealLogs] = await Promise.all([
      this.prisma.weightLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take,
        select: { loggedAt: true },
      }),
      this.prisma.waterLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take,
        select: { loggedAt: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take,
        select: { loggedAt: true },
      }),
      this.prisma.mealLog.findMany({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
        take,
        select: { loggedAt: true },
      }),
    ]);

    return [...weightLogs, ...waterLogs, ...exerciseLogs, ...mealLogs]
      .map((log) => log.loggedAt)
      .sort((a, b) => b.getTime() - a.getTime())
      .slice(0, take);
  }

  private async countLogsSince(userId: string, since: Date): Promise<number> {
    const where = { userId, loggedAt: { gte: since } };
    const counts = await Promise.all([
      this.prisma.weightLog.count({ where }),
      this.prisma.waterLog.count({ where }),
      this.prisma.exerciseLog.count({ where }),
      this.prisma.mealLog.count({ where }),
    ]);

    return counts.reduce((total, count) => total + count, 0);
  }
}

function bucketDailyCalories(
  mealLogs: Array<{ totalCalories: unknown; loggedAt: Date }>,
  timezone: string,
): DailyCalorieTotal[] {
  const totals = new Map<string, number>();

  for (const log of mealLogs) {
    const date = getLocalDateForTimezone(log.loggedAt, timezone);
    totals.set(date, (totals.get(date) ?? 0) + Number(log.totalCalories));
  }

  return Array.from(totals.entries())
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
