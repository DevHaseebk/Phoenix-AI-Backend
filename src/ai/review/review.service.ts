import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus, WeeklyReview } from '@prisma/client';
import { AI_PROVIDER } from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import {
  formatMemoryBlock,
  MemoryService,
  RetrievedMemory,
} from '../memory/memory.service';
import { weeklyReviewPrompt } from '../prompts/weekly-review.prompt';
import {
  computeWeeklyStats,
  getWeekEndDate,
  hasWeekEnded,
  HabitKey,
  notEnoughDataThresholdDays,
  resolveWeekStartDate,
  WeeklyReviewStats,
} from './weekly-review-stats.util';
import { getUtcRangeForLocalDateRange } from '../../dashboard/dashboard-timezone';
import { PrismaService } from '../../prisma/prisma.service';

const fallbackTimezone = 'Asia/Karachi';
/** Query with retrieveRelevantMemories() - a representative phrase, not the raw week data. */
const reviewMemoryQuery = 'weekly progress patterns';
const reviewMemoryTopK = 4;

interface WeeklyReviewNarrative {
  summary: string;
  whatWorked: string;
  whatGotDifficult: string;
  nextWeekFocus: string[];
}

interface StoredRecommendations {
  whatWorked: string | null;
  whatGotDifficult: string | null;
  nextWeekFocus: string[];
  bestHabit: HabitKey | null;
  weakestHabit: HabitKey | null;
  mealLoggingDays: number;
  waterLoggingDays: number;
  exerciseLoggingDays: number;
  weightLoggingDays: number;
  proteinTargetMetDays: number | null;
  totalLoggingDays: number;
  partial: boolean;
}

export interface WeeklyReviewResponse {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string | null;
  /** True when fewer than notEnoughDataThresholdDays had any log this week. */
  partial: boolean;
  /** False when the AI narrative was skipped (partial week) or failed. */
  aiGenerated: boolean;
  summary: string | null;
  whatWorked: string | null;
  whatGotDifficult: string | null;
  nextWeekFocus: string[];
  metrics: {
    averageCalories: number;
    averageProteinGrams: number;
    averageSteps: number;
    averageWaterMl: number;
    startWeightKg: number | null;
    endWeightKg: number | null;
    weightChangeKg: number | null;
    consistencyPercentage: number;
    mealLoggingDays: number;
    waterLoggingDays: number;
    exerciseLoggingDays: number;
    weightLoggingDays: number;
    proteinTargetMetDays: number | null;
  };
  habits: {
    best: HabitKey | null;
    weakest: HabitKey | null;
  };
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly memoryService: MemoryService,
  ) {}

  async getLatest(userId: string): Promise<WeeklyReviewResponse | null> {
    await this.ensureActiveUser(userId);

    const review = await this.prisma.weeklyReview.findFirst({
      where: { userId },
      orderBy: { weekStartDate: 'desc' },
    });

    return review ? toResponse(review) : null;
  }

  async generate(
    userId: string,
    requestedWeekStart?: string,
  ): Promise<WeeklyReviewResponse> {
    const user = await this.ensureActiveUser(userId);
    const timezone = user.profile?.timezone ?? fallbackTimezone;
    const now = new Date();
    const weekStartDate = resolveWeekStartDate(
      timezone,
      now,
      requestedWeekStart,
    );
    const weekEndDate = getWeekEndDate(weekStartDate);

    if (!hasWeekEnded(weekEndDate, timezone, now)) {
      throw new BadRequestException(
        'Cannot generate a review for a week that has not ended yet.',
      );
    }

    const stats = await this.computeStatsForWeek(
      userId,
      timezone,
      weekStartDate,
      weekEndDate,
      toNullableNumber(user.profile?.proteinTargetGrams),
    );
    const isPartial = stats.totalLoggingDays < notEnoughDataThresholdDays;

    let narrative: WeeklyReviewNarrative | null;
    let providerName: string | null = null;

    if (isPartial) {
      narrative = buildPartialNarrative(stats);
    } else {
      const result = await this.generateAiNarrative(
        userId,
        user,
        stats,
        weekStartDate,
      );
      narrative = result.narrative;
      providerName = result.providerName;
    }

    const weekStartUtc = new Date(`${weekStartDate}T00:00:00.000Z`);
    const weekEndUtc = new Date(`${weekEndDate}T00:00:00.000Z`);
    const recommendations: StoredRecommendations = {
      whatWorked: narrative?.whatWorked ?? null,
      whatGotDifficult: narrative?.whatGotDifficult ?? null,
      nextWeekFocus: narrative?.nextWeekFocus ?? [],
      bestHabit: stats.bestHabit,
      weakestHabit: stats.weakestHabit,
      mealLoggingDays: stats.mealLoggingDays,
      waterLoggingDays: stats.waterLoggingDays,
      exerciseLoggingDays: stats.exerciseLoggingDays,
      weightLoggingDays: stats.weightLoggingDays,
      proteinTargetMetDays: stats.proteinTargetMetDays,
      totalLoggingDays: stats.totalLoggingDays,
      partial: isPartial,
    };
    const persistedFields = {
      weekEndDate: weekEndUtc,
      avgCalories: stats.avgCalories,
      avgProteinGrams: stats.avgProteinGrams,
      avgSteps: stats.avgSteps,
      avgWaterMl: stats.avgWaterMl,
      startWeightKg: stats.startWeightKg,
      endWeightKg: stats.endWeightKg,
      weightChangeKg: stats.weightChangeKg,
      consistencyRate: stats.consistencyRate,
      aiSummary: narrative?.summary ?? null,
      aiRecommendations: recommendations as unknown as Prisma.InputJsonValue,
      generatedByProvider: providerName,
      generatedAt: narrative ? now : null,
    };

    const saved = await this.prisma.weeklyReview.upsert({
      where: {
        userId_weekStartDate: { userId, weekStartDate: weekStartUtc },
      },
      create: { userId, weekStartDate: weekStartUtc, ...persistedFields },
      update: persistedFields,
    });

    return toResponse(saved);
  }

  private async generateAiNarrative(
    userId: string,
    user: ActiveUser,
    stats: WeeklyReviewStats,
    weekStartDate: string,
  ): Promise<{
    narrative: WeeklyReviewNarrative | null;
    providerName: string | null;
  }> {
    if (!this.aiProvider.generateWeeklyReview) {
      return { narrative: null, providerName: null };
    }

    try {
      const [previousReview, memories] = await Promise.all([
        this.prisma.weeklyReview.findFirst({
          where: {
            userId,
            weekStartDate: { lt: new Date(`${weekStartDate}T00:00:00.000Z`) },
          },
          orderBy: { weekStartDate: 'desc' },
        }),
        this.memoryService.retrieveRelevantMemories(
          userId,
          reviewMemoryQuery,
          reviewMemoryTopK,
        ),
      ]);

      const response = await this.aiProvider.generateWeeklyReview({
        systemPrompt: weeklyReviewPrompt,
        userPrompt: buildUserPrompt(user, stats, previousReview, memories),
        model: this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
        timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000'),
      });

      return {
        narrative: response.structured,
        providerName: this.config.get<string>('AI_PROVIDER') ?? 'gemini',
      };
    } catch (error) {
      this.logger.warn(
        `Weekly review AI narrative failed, persisting stats only: ${String(error)}`,
      );

      return { narrative: null, providerName: null };
    }
  }

  private async computeStatsForWeek(
    userId: string,
    timezone: string,
    weekStartDate: string,
    weekEndDate: string,
    proteinTargetGrams: number | null,
  ): Promise<WeeklyReviewStats> {
    const { startUtc, endUtc } = getUtcRangeForLocalDateRange(
      timezone,
      weekStartDate,
      weekEndDate,
    );
    const rangeWhere = { userId, loggedAt: { gte: startUtc, lte: endUtc } };

    const [mealLogs, waterLogs, exerciseLogs, weightLogs] = await Promise.all([
      this.prisma.mealLog.findMany({
        where: rangeWhere,
        select: {
          loggedAt: true,
          totalCalories: true,
          totalProteinGrams: true,
        },
      }),
      this.prisma.waterLog.findMany({
        where: rangeWhere,
        select: { loggedAt: true, amountMl: true },
      }),
      this.prisma.exerciseLog.findMany({
        where: rangeWhere,
        select: { loggedAt: true, steps: true },
      }),
      this.prisma.weightLog.findMany({
        where: rangeWhere,
        select: { loggedAt: true, weightKg: true },
      }),
    ]);

    return computeWeeklyStats({
      timezone,
      proteinTargetGrams,
      mealLogs: mealLogs.map((log) => ({
        loggedAt: log.loggedAt,
        totalCalories: Number(log.totalCalories),
        totalProteinGrams: Number(log.totalProteinGrams),
      })),
      waterLogs: waterLogs.map((log) => ({
        loggedAt: log.loggedAt,
        amountMl: log.amountMl,
      })),
      exerciseLogs: exerciseLogs.map((log) => ({
        loggedAt: log.loggedAt,
        steps: log.steps,
      })),
      weightLogs: weightLogs.map((log) => ({
        loggedAt: log.loggedAt,
        weightKg: Number(log.weightKg),
      })),
    });
  }

  private async ensureActiveUser(userId: string): Promise<ActiveUser> {
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
            gender: true,
            dateOfBirth: true,
            goalType: true,
            goalPace: true,
            activityLevel: true,
            currentWeightKg: true,
            targetWeightKg: true,
            calorieTarget: true,
            proteinTargetGrams: true,
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

type ActiveUser = Prisma.UserGetPayload<{
  select: {
    id: true;
    fullName: true;
    status: true;
    deletedAt: true;
    profile: {
      select: {
        timezone: true;
        gender: true;
        dateOfBirth: true;
        goalType: true;
        goalPace: true;
        activityLevel: true;
        currentWeightKg: true;
        targetWeightKg: true;
        calorieTarget: true;
        proteinTargetGrams: true;
      };
    };
  };
}>;

type WeeklyReviewRow = WeeklyReview;

function buildUserPrompt(
  user: ActiveUser,
  stats: WeeklyReviewStats,
  previousReview: WeeklyReviewRow | null,
  memories: RetrievedMemory[],
): string {
  const profile = user.profile;
  const profileSummary = {
    fullName: user.fullName,
    goalType: profile?.goalType,
    goalPace: profile?.goalPace,
    activityLevel: profile?.activityLevel,
  };
  const weekSummary = {
    averageCalories: stats.avgCalories,
    averageProteinGrams: stats.avgProteinGrams,
    averageSteps: stats.avgSteps,
    averageWaterMl: stats.avgWaterMl,
    mealLoggingDays: `${stats.mealLoggingDays}/7`,
    waterLoggingDays: `${stats.waterLoggingDays}/7`,
    exerciseLoggingDays: `${stats.exerciseLoggingDays}/7`,
    consistencyPercentage: stats.consistencyRate,
    startWeightKg: stats.startWeightKg,
    endWeightKg: stats.endWeightKg,
    weightChangeKg: stats.weightChangeKg,
    bestHabit: stats.bestHabit,
    weakestHabit: stats.weakestHabit,
  };
  const previousWeekSummary = previousReview
    ? JSON.stringify({
        averageCalories: previousReview.avgCalories
          ? Number(previousReview.avgCalories)
          : null,
        consistencyPercentage: previousReview.consistencyRate
          ? Number(previousReview.consistencyRate)
          : null,
        weightChangeKg: previousReview.weightChangeKg
          ? Number(previousReview.weightChangeKg)
          : null,
        summary: previousReview.aiSummary,
      })
    : 'No prior data - this is the first weekly review for this user.';
  const goalProgress = {
    goalType: profile?.goalType,
    goalPace: profile?.goalPace,
    currentWeightKg: toNullableNumber(profile?.currentWeightKg),
    targetWeightKg: toNullableNumber(profile?.targetWeightKg),
    calorieTarget: toNullableNumber(profile?.calorieTarget),
    proteinTargetGrams: toNullableNumber(profile?.proteinTargetGrams),
  };
  const relevantMemory =
    memories.length > 0
      ? formatMemoryBlock(memories)
      : 'No relevant long-term memories recorded yet.';

  return [
    `User profile:\n${JSON.stringify(profileSummary)}`,
    `Week summary:\n${JSON.stringify(weekSummary)}`,
    `Previous week summary:\n${previousWeekSummary}`,
    `Goal progress:\n${JSON.stringify(goalProgress)}`,
    `Relevant memories:\n${relevantMemory}`,
  ].join('\n\n');
}

/** Zero-AI-call fallback for a week with too little data (backend-first, per CLAUDE.md §4). */
function buildPartialNarrative(
  stats: WeeklyReviewStats,
): WeeklyReviewNarrative {
  const dayWord = stats.totalLoggingDays === 1 ? 'day' : 'days';

  return {
    summary: `There wasn't enough logging this week to build a full review - only ${stats.totalLoggingDays} of 7 days had any log at all. No pressure, just pick it back up and a complete review will be ready next week.`,
    whatWorked:
      stats.totalLoggingDays > 0
        ? `You logged something on ${stats.totalLoggingDays} ${dayWord} this week - that's a real start.`
        : "No logs yet this week - that's okay, every week is a fresh start.",
    whatGotDifficult:
      'Most days did not have a meal, water, or weight log, so trends could not be measured yet.',
    nextWeekFocus: [
      'Log at least one meal every day',
      'Log water at least a few times this week',
      'Add a weight check-in if you can',
    ],
  };
}

function toResponse(review: WeeklyReviewRow): WeeklyReviewResponse {
  const recommendations = (review.aiRecommendations ??
    {}) as Partial<StoredRecommendations>;

  return {
    id: review.id,
    weekStart: review.weekStartDate.toISOString().slice(0, 10),
    weekEnd: review.weekEndDate.toISOString().slice(0, 10),
    generatedAt: review.generatedAt ? review.generatedAt.toISOString() : null,
    partial: recommendations.partial ?? false,
    aiGenerated: review.aiSummary !== null && !recommendations.partial,
    summary: review.aiSummary,
    whatWorked: recommendations.whatWorked ?? null,
    whatGotDifficult: recommendations.whatGotDifficult ?? null,
    nextWeekFocus: recommendations.nextWeekFocus ?? [],
    metrics: {
      averageCalories: toNullableNumber(review.avgCalories) ?? 0,
      averageProteinGrams: toNullableNumber(review.avgProteinGrams) ?? 0,
      averageSteps: toNullableNumber(review.avgSteps) ?? 0,
      averageWaterMl: toNullableNumber(review.avgWaterMl) ?? 0,
      startWeightKg: toNullableNumber(review.startWeightKg),
      endWeightKg: toNullableNumber(review.endWeightKg),
      weightChangeKg: toNullableNumber(review.weightChangeKg),
      consistencyPercentage: toNullableNumber(review.consistencyRate) ?? 0,
      mealLoggingDays: recommendations.mealLoggingDays ?? 0,
      waterLoggingDays: recommendations.waterLoggingDays ?? 0,
      exerciseLoggingDays: recommendations.exerciseLoggingDays ?? 0,
      weightLoggingDays: recommendations.weightLoggingDays ?? 0,
      proteinTargetMetDays: recommendations.proteinTargetMetDays ?? null,
    },
    habits: {
      best: recommendations.bestHabit ?? null,
      weakest: recommendations.weakestHabit ?? null,
    },
  };
}

function toNullableNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}
