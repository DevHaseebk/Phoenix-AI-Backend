import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MealType, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getLocalDateForTimezone,
  getLocalDateRangeForTimezone,
  getTodayRangeForTimezone,
} from './dashboard-timezone';
import { DashboardSummaryRange } from './dto/dashboard-summary-query.dto';

const fallbackTimezone = 'Asia/Karachi';
const waterTargetMl = 3000;
const stepsTarget = 8000;

export interface DashboardTodayResponse {
  date: string;
  timezone: string;
  profileRequired: boolean;
  onboardingRequired: boolean;
  hero: {
    greeting: string;
    currentWeightKg: number | null;
    startingWeightKg: number | null;
    targetWeightKg: number | null;
    weightLostKg: number | null;
    remainingKg: number | null;
    progressPercentage: number;
  };
  todayProgress: {
    calories: {
      consumed: number;
      target: number | null;
      remaining: number | null;
    };
    protein: {
      consumedGrams: number;
      targetGrams: number | null;
      remainingGrams: number | null;
    };
    water: {
      consumedMl: number;
      targetMl: number;
      remainingMl: number;
    };
    steps: {
      count: number;
      target: number;
      remaining: number;
    };
    exercise: {
      durationMinutes: number;
      estimatedCaloriesBurned: number;
    };
  };
  timeline: MealTimelineItem[];
  quickActions: string[];
  aiFocus: {
    title: string;
    message: string;
    actions: Array<{
      type: string;
      label: string;
    }>;
  };
  weeklyReview: {
    available: false;
    status: 'COMING_SOON';
  };
  rewardsPreview: {
    available: false;
    status: 'COMING_SOON';
  };
  consistency: {
    last30DaysPercentage: 0;
    label: 'Getting started';
  };
}

interface MealTimelineItem {
  id: string;
  type: 'MEAL';
  mealType: MealType;
  description: string | null;
  loggedAt: Date;
  totalCalories: number;
  totalProteinGrams: number;
  items: Array<{
    foodName: string;
    portionLabel: string | null;
  }>;
}

export interface DashboardSummaryResponse {
  range: DashboardSummaryRange;
  startDate: string;
  endDate: string;
  averageCalories: number;
  averageProteinGrams: number;
  averageWaterMl: number;
  averageSteps: number;
  exerciseSessions: number;
  totalExerciseMinutes: number;
  weightChangeKg: number | null;
  mealLoggingDays: number;
  waterLoggingDays: number;
  exerciseLoggingDays: number;
  weightLoggingDays: number;
  consistencyPercentage: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(
    userId: string,
    now = new Date(),
  ): Promise<DashboardTodayResponse> {
    const user = await this.findActiveUser(userId);
    const profile = user.profile;
    const timezone = profile?.timezone ?? fallbackTimezone;
    const todayRange = getTodayRangeForTimezone(timezone, now);

    const [
      latestWeightLog,
      earliestWeightLog,
      waterLogs,
      exerciseLogs,
      mealLogs,
    ] = await Promise.all([
      this.prisma.weightLog.findFirst({
        where: {
          userId,
          loggedAt: { lte: todayRange.endUtc },
        },
        orderBy: { loggedAt: 'desc' },
        select: { weightKg: true },
      }),
      this.prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'asc' },
        select: { weightKg: true },
      }),
      this.prisma.waterLog.findMany({
        where: {
          userId,
          loggedAt: { gte: todayRange.startUtc, lte: todayRange.endUtc },
        },
        select: { amountMl: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: {
          userId,
          loggedAt: { gte: todayRange.startUtc, lte: todayRange.endUtc },
        },
        select: {
          durationMinutes: true,
          steps: true,
          estimatedCaloriesBurned: true,
        },
      }),
      this.prisma.mealLog.findMany({
        where: {
          userId,
          loggedAt: { gte: todayRange.startUtc, lte: todayRange.endUtc },
        },
        orderBy: { loggedAt: 'asc' },
        select: {
          id: true,
          mealType: true,
          description: true,
          loggedAt: true,
          totalCalories: true,
          totalProteinGrams: true,
          items: {
            select: {
              foodName: true,
              portionLabel: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const currentWeightKg = firstNumber(
      latestWeightLog?.weightKg,
      profile?.currentWeightKg,
    );
    const startingWeightKg = firstNumber(
      earliestWeightLog?.weightKg,
      profile?.currentWeightKg,
    );
    const targetWeightKg = toNullableNumber(profile?.targetWeightKg);
    const weightLostKg =
      startingWeightKg === null || currentWeightKg === null
        ? null
        : roundOne(startingWeightKg - currentWeightKg);
    const remainingKg =
      currentWeightKg === null || targetWeightKg === null
        ? null
        : roundOne(currentWeightKg - targetWeightKg);
    const caloriesConsumed = sumDecimal(mealLogs, 'totalCalories');
    const proteinConsumedGrams = sumDecimal(mealLogs, 'totalProteinGrams');
    const calorieTarget = toNullableNumber(profile?.calorieTarget);
    const proteinTargetGrams = toNullableNumber(profile?.proteinTargetGrams);
    const waterConsumedMl = waterLogs.reduce(
      (total, waterLog) => total + waterLog.amountMl,
      0,
    );
    const stepsCount = exerciseLogs.reduce(
      (total, exerciseLog) => total + (exerciseLog.steps ?? 0),
      0,
    );
    const exerciseDurationMinutes = exerciseLogs.reduce(
      (total, exerciseLog) => total + exerciseLog.durationMinutes,
      0,
    );
    const exerciseEstimatedCaloriesBurned = exerciseLogs.reduce(
      (total, exerciseLog) =>
        total + (exerciseLog.estimatedCaloriesBurned ?? 0),
      0,
    );
    const timeline = mealLogs.map(toMealTimelineItem);

    return {
      date: todayRange.date,
      timezone,
      profileRequired: !profile,
      onboardingRequired: user.onboarding?.status !== 'COMPLETED',
      hero: {
        greeting: buildGreeting(user.fullName, todayRange.localHour),
        currentWeightKg,
        startingWeightKg,
        targetWeightKg,
        weightLostKg,
        remainingKg,
        progressPercentage: calculateProgressPercentage(
          startingWeightKg,
          currentWeightKg,
          targetWeightKg,
        ),
      },
      todayProgress: {
        calories: {
          consumed: caloriesConsumed,
          target: calorieTarget,
          remaining: calculateRemaining(calorieTarget, caloriesConsumed),
        },
        protein: {
          consumedGrams: proteinConsumedGrams,
          targetGrams: proteinTargetGrams,
          remainingGrams: calculateRemaining(
            proteinTargetGrams,
            proteinConsumedGrams,
          ),
        },
        water: {
          consumedMl: waterConsumedMl,
          targetMl: waterTargetMl,
          remainingMl: Math.max(waterTargetMl - waterConsumedMl, 0),
        },
        steps: {
          count: stepsCount,
          target: stepsTarget,
          remaining: Math.max(stepsTarget - stepsCount, 0),
        },
        exercise: {
          durationMinutes: exerciseDurationMinutes,
          estimatedCaloriesBurned: exerciseEstimatedCaloriesBurned,
        },
      },
      timeline,
      quickActions: [
        'LOG_MEAL',
        'UPDATE_WEIGHT',
        'LOG_WATER',
        'LOG_EXERCISE',
        'ASK_AI',
      ],
      aiFocus: buildAiFocus({
        hasLogs:
          mealLogs.length > 0 ||
          waterLogs.length > 0 ||
          exerciseLogs.length > 0,
        caloriesConsumed,
        calorieTarget,
        proteinConsumedGrams,
        proteinTargetGrams,
        waterConsumedMl,
      }),
      weeklyReview: { available: false, status: 'COMING_SOON' },
      rewardsPreview: { available: false, status: 'COMING_SOON' },
      consistency: { last30DaysPercentage: 0, label: 'Getting started' },
    };
  }

  async getSummary(
    userId: string,
    range: DashboardSummaryRange = DashboardSummaryRange.SEVEN_DAYS,
    now = new Date(),
  ): Promise<DashboardSummaryResponse> {
    const user = await this.findActiveUser(userId);
    const timezone = user.profile?.timezone ?? fallbackTimezone;
    const dayCount = getSummaryDayCount(range);
    const dateRange = getLocalDateRangeForTimezone(timezone, dayCount, now);
    const rangeWhere = {
      userId,
      loggedAt: {
        gte: dateRange.startUtc,
        lte: dateRange.endUtc,
      },
    };

    const [weightLogs, waterLogs, exerciseLogs, mealLogs] = await Promise.all([
      this.prisma.weightLog.findMany({
        where: rangeWhere,
        orderBy: { loggedAt: 'asc' },
        select: { weightKg: true, loggedAt: true },
      }),
      this.prisma.waterLog.findMany({
        where: rangeWhere,
        select: { amountMl: true, loggedAt: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: rangeWhere,
        select: {
          durationMinutes: true,
          steps: true,
          loggedAt: true,
        },
      }),
      this.prisma.mealLog.findMany({
        where: rangeWhere,
        select: {
          totalCalories: true,
          totalProteinGrams: true,
          loggedAt: true,
        },
      }),
    ]);

    const totalCalories = sumDecimal(mealLogs, 'totalCalories');
    const totalProteinGrams = sumDecimal(mealLogs, 'totalProteinGrams');
    const totalWaterMl = waterLogs.reduce(
      (total, waterLog) => total + waterLog.amountMl,
      0,
    );
    const totalSteps = exerciseLogs.reduce(
      (total, exerciseLog) => total + (exerciseLog.steps ?? 0),
      0,
    );
    const totalExerciseMinutes = exerciseLogs.reduce(
      (total, exerciseLog) => total + exerciseLog.durationMinutes,
      0,
    );
    const proteinTargetGrams = toNullableNumber(
      user.profile?.proteinTargetGrams,
    );

    return {
      range,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      averageCalories: Math.round(totalCalories / dayCount),
      averageProteinGrams: Math.round(totalProteinGrams / dayCount),
      averageWaterMl: Math.round(totalWaterMl / dayCount),
      averageSteps: Math.round(totalSteps / dayCount),
      exerciseSessions: exerciseLogs.length,
      totalExerciseMinutes,
      weightChangeKg: calculateWeightChange(weightLogs),
      mealLoggingDays: countDistinctLocalDates(mealLogs, timezone),
      waterLoggingDays: countDistinctLocalDates(waterLogs, timezone),
      exerciseLoggingDays: countDistinctLocalDates(exerciseLogs, timezone),
      weightLoggingDays: countDistinctLocalDates(weightLogs, timezone),
      consistencyPercentage: calculateConsistencyPercentage({
        dayCount,
        timezone,
        mealLogs,
        waterLogs,
        exerciseLogs,
        weightLogs,
        proteinTargetGrams,
      }),
    };
  }

  private async findActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        status: true,
        deletedAt: true,
        profile: {
          select: {
            timezone: true,
            calorieTarget: true,
            proteinTargetGrams: true,
            currentWeightKg: true,
            targetWeightKg: true,
          },
        },
        onboarding: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}

function getSummaryDayCount(range: DashboardSummaryRange): number {
  const dayCounts: Record<DashboardSummaryRange, number> = {
    [DashboardSummaryRange.SEVEN_DAYS]: 7,
    [DashboardSummaryRange.THIRTY_DAYS]: 30,
    [DashboardSummaryRange.NINETY_DAYS]: 90,
  };
  const dayCount = dayCounts[range];

  if (!dayCount) {
    throw new BadRequestException('Invalid dashboard summary range');
  }

  return dayCount;
}

function toNullableNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function firstNumber(
  first: Prisma.Decimal | number | null | undefined,
  fallback: Prisma.Decimal | number | null | undefined,
): number | null {
  return toNullableNumber(first) ?? toNullableNumber(fallback);
}

function sumDecimal<TItem extends Record<string, unknown>>(
  items: TItem[],
  key: keyof TItem,
): number {
  return items.reduce((total, item) => total + Number(item[key]), 0);
}

function calculateRemaining(
  target: number | null,
  consumed: number,
): number | null {
  return target === null ? null : Math.max(target - consumed, 0);
}

function calculateProgressPercentage(
  startingWeightKg: number | null,
  currentWeightKg: number | null,
  targetWeightKg: number | null,
): number {
  if (
    startingWeightKg === null ||
    currentWeightKg === null ||
    targetWeightKg === null
  ) {
    return 0;
  }

  const denominator = startingWeightKg - targetWeightKg;

  if (denominator <= 0) {
    return 0;
  }

  return clamp(
    Math.round(((startingWeightKg - currentWeightKg) / denominator) * 100),
  );
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateWeightChange(
  weightLogs: Array<{ weightKg: Prisma.Decimal | number }>,
): number | null {
  if (weightLogs.length < 2) {
    return null;
  }

  const earliestWeightKg = Number(weightLogs[0].weightKg);
  const latestWeightKg = Number(weightLogs[weightLogs.length - 1].weightKg);

  return roundOne(latestWeightKg - earliestWeightKg);
}

function countDistinctLocalDates(
  logs: Array<{ loggedAt: Date }>,
  timezone: string,
): number {
  return new Set(
    logs.map((log) => getLocalDateForTimezone(log.loggedAt, timezone)),
  ).size;
}

function calculateConsistencyPercentage(input: {
  dayCount: number;
  timezone: string;
  mealLogs: Array<{
    loggedAt: Date;
    totalProteinGrams: Prisma.Decimal | number;
  }>;
  waterLogs: Array<{ loggedAt: Date }>;
  exerciseLogs: Array<{ loggedAt: Date }>;
  weightLogs: Array<{ loggedAt: Date }>;
  proteinTargetGrams: number | null;
}): number {
  const mealDates = buildLocalDateSet(input.mealLogs, input.timezone);
  const waterDates = buildLocalDateSet(input.waterLogs, input.timezone);
  const exerciseDates = buildLocalDateSet(input.exerciseLogs, input.timezone);
  const weightDates = buildLocalDateSet(input.weightLogs, input.timezone);
  const proteinByDate = input.mealLogs.reduce<Record<string, number>>(
    (totals, mealLog) => {
      const date = getLocalDateForTimezone(mealLog.loggedAt, input.timezone);
      totals[date] = (totals[date] ?? 0) + Number(mealLog.totalProteinGrams);

      return totals;
    },
    {},
  );
  const allDates = new Set([
    ...mealDates,
    ...waterDates,
    ...exerciseDates,
    ...weightDates,
  ]);
  const maxDailyPoints = input.proteinTargetGrams === null ? 80 : 100;

  if (allDates.size === 0) {
    return 0;
  }

  let earnedPoints = 0;

  for (const date of allDates) {
    earnedPoints += mealDates.has(date) ? 30 : 0;
    earnedPoints += waterDates.has(date) ? 20 : 0;
    earnedPoints += exerciseDates.has(date) ? 20 : 0;
    earnedPoints += weightDates.has(date) ? 10 : 0;

    if (
      input.proteinTargetGrams !== null &&
      (proteinByDate[date] ?? 0) >= input.proteinTargetGrams
    ) {
      earnedPoints += 20;
    }
  }

  return clamp(
    Math.round((earnedPoints / (input.dayCount * maxDailyPoints)) * 100),
  );
}

function buildLocalDateSet(
  logs: Array<{ loggedAt: Date }>,
  timezone: string,
): Set<string> {
  return new Set(
    logs.map((log) => getLocalDateForTimezone(log.loggedAt, timezone)),
  );
}

function buildGreeting(fullName: string | null, localHour: number): string {
  const firstName = fullName?.trim().split(/\s+/)[0] || 'there';
  const dayPart =
    localHour < 12 ? 'morning' : localHour < 17 ? 'afternoon' : 'evening';

  return `Good ${dayPart}, ${firstName}`;
}

function toMealTimelineItem(mealLog: {
  id: string;
  mealType: MealType;
  description: string | null;
  loggedAt: Date;
  totalCalories: Prisma.Decimal | number;
  totalProteinGrams: Prisma.Decimal | number;
  items: Array<{
    foodName: string;
    portionLabel: string | null;
  }>;
}): MealTimelineItem {
  return {
    id: mealLog.id,
    type: 'MEAL',
    mealType: mealLog.mealType,
    description: mealLog.description,
    loggedAt: mealLog.loggedAt,
    totalCalories: Number(mealLog.totalCalories),
    totalProteinGrams: Number(mealLog.totalProteinGrams),
    items: mealLog.items.map((item) => ({
      foodName: item.foodName,
      portionLabel: item.portionLabel,
    })),
  };
}

function buildAiFocus(input: {
  hasLogs: boolean;
  caloriesConsumed: number;
  calorieTarget: number | null;
  proteinConsumedGrams: number;
  proteinTargetGrams: number | null;
  waterConsumedMl: number;
}): DashboardTodayResponse['aiFocus'] {
  if (!input.hasLogs) {
    return {
      title: 'Start with one small win',
      message: 'Log your first meal, water, or weight update to begin today.',
      actions: [{ type: 'LOG_MEAL', label: 'Log Meal' }],
    };
  }

  const proteinGap =
    input.proteinTargetGrams === null
      ? 0
      : Math.max(input.proteinTargetGrams - input.proteinConsumedGrams, 0);
  const waterGap = Math.max(waterTargetMl - input.waterConsumedMl, 0);
  const calorieGap =
    input.calorieTarget === null
      ? 0
      : Math.max(input.calorieTarget - input.caloriesConsumed, 0);

  if (proteinGap >= 30 && proteinGap >= waterGap / 100) {
    return {
      title: 'Protein is your main gap today',
      message: 'Try to add protein in your next meal.',
      actions: [{ type: 'ASK_DINNER_IDEA', label: 'Suggest Dinner' }],
    };
  }

  if (waterGap > 0) {
    return {
      title: 'Water is still open today',
      message: `You have ${waterGap}ml left to reach today's water target.`,
      actions: [{ type: 'LOG_WATER', label: 'Log Water' }],
    };
  }

  if (calorieGap > 0) {
    return {
      title: 'You still have room today',
      message: `You have about ${calorieGap} calories remaining today.`,
      actions: [{ type: 'LOG_MEAL', label: 'Log Meal' }],
    };
  }

  return {
    title: 'Nice work logging today',
    message: 'Your dashboard has enough signal for today. Keep it simple.',
    actions: [{ type: 'ASK_AI', label: 'Ask AI' }],
  };
}
