import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiConversationStatus,
  AiConversationType,
  AiMealEstimateStatus,
  AiMessageRole,
  ConfidenceLevel,
  ExerciseLogSource,
  ExerciseType,
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import {
  AI_PROVIDER,
  AiSafetyFlags,
  ExerciseEstimateItemOutput,
  MealEstimateItemOutput,
} from './ai-provider.interface';
import type { AiProvider } from './ai-provider.interface';
import { ChatDto } from './dto/chat.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { MealConfirmDto, MealConfirmItemDto } from './dto/meal-confirm.dto';
import { MealEstimateDto } from './dto/meal-estimate.dto';
import { dailyFitSystemPrompt } from './prompts/dailyfit-system.prompt';
import { detectSafetyFlags } from './utils/ai-safety.util';
import { containsLoggableContent } from './utils/loggable-content.util';
import {
  MealItemResolverService,
  MealResolutionResult,
} from './food/meal-item-resolver.service';
import { formatMemoryBlock, MemoryService } from './memory/memory.service';
import { formatKnowledgeBlock, RagService } from './rag/rag.service';
import { UserStateService } from './user-state/user-state.service';
import { calculateCalorieDeficitKcal } from '../common/utils/calorie-balance.util';
import {
  calculateAge,
  calculateBmr,
  calculateTdee,
} from '../common/utils/health-metrics.util';
import {
  getTodayRangeForTimezone,
  getUtcInstantForLocalDate,
} from '../dashboard/dashboard-timezone';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

/** Bounded conversation-history window sent to the model per chat turn. */
const chatHistoryMessageLimit = 10;
/** Per-message truncation cap so one long message cannot blow up the prompt. */
const chatHistoryMessageMaxChars = 500;
const chatKnowledgeTopK = 4;
const chatMemoryTopK = 4;

export interface MealLogItemResponse {
  id: string;
  foodName: string;
  portionLabel: string | null;
  quantity: number | null;
  calories: number;
  proteinGrams: number;
  carbsGrams: number | null;
  fatGrams: number | null;
  confidenceLevel: ConfidenceLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealLogResponse {
  id: string;
  mealType: MealType;
  description: string | null;
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number | null;
  totalFatGrams: number | null;
  status: MealLogStatus;
  confidenceLevel: ConfidenceLevel;
  source: MealLogSource;
  loggedAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: MealLogItemResponse[];
}

const mealLogItemSafeSelect = {
  id: true,
  foodName: true,
  portionLabel: true,
  quantity: true,
  calories: true,
  proteinGrams: true,
  carbsGrams: true,
  fatGrams: true,
  confidenceLevel: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MealLogItemSelect;

const mealLogSafeSelect = {
  id: true,
  mealType: true,
  description: true,
  totalCalories: true,
  totalProteinGrams: true,
  totalCarbsGrams: true,
  totalFatGrams: true,
  status: true,
  confidenceLevel: true,
  source: true,
  loggedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: mealLogItemSafeSelect,
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MealLogSelect;

type MealLogWithItems = Prisma.MealLogGetPayload<{
  select: typeof mealLogSafeSelect;
}>;

interface UserContextResult {
  context: string;
  bmrKcal: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  /** User's local timezone + today's local date (from the dashboard's
   * canonical timezone helper) - reused by day-activity segmentation to
   * resolve relative date phrases ("kal", "yesterday") per item. */
  timezone: string;
  todayDate: string;
}

/** Confirmed exercise row summary returned by confirmMeal(). */
export interface ConfirmedExerciseLogResponse {
  id: string;
  exerciseType: ExerciseType;
  durationMinutes: number;
  steps: number | null;
  distanceKm: number | null;
  estimatedCaloriesBurned: number | null;
  loggedAt: Date;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly dashboardService: DashboardService,
    private readonly ragService: RagService,
    private readonly memoryService: MemoryService,
    private readonly userStateService: UserStateService,
    private readonly mealItemResolverService: MealItemResolverService,
  ) {}

  async chat(userId: string, dto: ChatDto) {
    await this.ensureActiveUser(userId);
    const conversation = await this.resolveConversation(
      userId,
      dto.conversationId,
      AiConversationType.COACHING,
      dto.message,
    );
    const userMessage = await this.prisma.aiMessage.create({
      data: {
        userId,
        conversationId: conversation.id,
        role: AiMessageRole.USER,
        content: dto.message,
      },
      select: { id: true },
    });
    const safetyFlags = detectSafetyFlags(dto.message);

    if (safetyFlags.blocked) {
      const assistant = await this.saveAssistantMessage({
        userId,
        conversationId: conversation.id,
        content: safetyFlags.message ?? 'I cannot help with that request.',
        safetyFlags,
      });

      return {
        conversationId: conversation.id,
        message: assistant,
        suggestions: ['Log a meal', 'Drink water', 'Ask for a safer plan'],
        safetyFlags,
      };
    }

    const userContext = await this.buildUserContext(userId);

    // Unified logging interception: when a chat message plausibly describes
    // food eaten or exercise done (deterministic keyword pre-filter, zero AI
    // calls - CLAUDE.md §4), run the same day-activity estimate pipeline as
    // estimateMeal() and return the shared review-before-log estimate card
    // instead of a plain reply. chat() never silently creates log rows: the
    // user still confirms via /ai/meal-confirm, exactly like Meal mode. If
    // segmentation finds nothing loggable, this returns null and the normal
    // coaching reply below proceeds (cost: the one segmentation call).
    if (containsLoggableContent(dto.message)) {
      const intercepted = await this.tryBuildChatEstimate({
        userId,
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        message: dto.message,
        userContext,
        safetyFlags,
      });

      if (intercepted) {
        return intercepted;
      }
    }

    const [knowledgeChunks, memories, recentHistory] = await Promise.all([
      this.ragService.retrieveRelevantChunks(dto.message, chatKnowledgeTopK),
      this.memoryService.retrieveRelevantMemories(
        userId,
        dto.message,
        chatMemoryTopK,
      ),
      this.getRecentConversationHistory(conversation.id, userMessage.id),
    ]);
    // Deterministic, non-AI classification - reuses the BMR/weight numbers
    // already computed in buildUserContext() rather than recomputing them.
    const userState = await this.userStateService.determineForUser(userId, {
      hasMedicalRiskFlag: safetyFlags.blocked,
      bmrKcal: userContext.bmrKcal,
      currentWeightKg: userContext.currentWeightKg,
      targetWeightKg: userContext.targetWeightKg,
    });
    const promptSections = [
      `User context (authoritative app data):\n${userContext.context}`,
      `User state (server-computed, do not ask the user about it):\n${JSON.stringify(userState)}`,
    ];

    if (knowledgeChunks.length > 0) {
      promptSections.push(
        `Coaching knowledge (general reference material retrieved for this message; not user data):\n${formatKnowledgeBlock(knowledgeChunks)}`,
      );
    }

    if (memories.length > 0) {
      promptSections.push(
        `Known patterns about this user (learned over time, not confirmed for today):\n${formatMemoryBlock(memories)}`,
      );
    }

    if (recentHistory) {
      promptSections.push(
        `Recent conversation (oldest first):\n${recentHistory}`,
      );
    }

    promptSections.push(`User message:\n${dto.message}`);

    const providerResponse = await this.aiProvider.generateCoachReply({
      systemPrompt: dailyFitSystemPrompt,
      userPrompt: promptSections.join('\n\n'),
      ...this.getProviderConfig(),
    });

    if (providerResponse.supportModeTriggered) {
      this.logger.log(
        `Support Mode triggered for user ${userId} in conversation ${conversation.id}.`,
      );
    }

    const assistant = await this.saveAssistantMessage({
      userId,
      conversationId: conversation.id,
      content: providerResponse.content,
      structured: {
        supportModeTriggered: providerResponse.supportModeTriggered,
      },
      model: providerResponse.model,
      tokenInput: providerResponse.tokenInput,
      tokenOutput: providerResponse.tokenOutput,
      latencyMs: providerResponse.latencyMs,
      safetyFlags,
    });

    await this.touchConversation(conversation.id);

    // Fire-and-forget: extraction never blocks the response, and never throws.
    void this.memoryService.extractAndSaveMemory(
      userId,
      buildMemoryExtractionTurnText(
        recentHistory,
        dto.message,
        providerResponse.content,
      ),
    );

    return {
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      message: assistant,
      suggestions: ['Log meal estimate', 'Review today', 'Plan next meal'],
      safetyFlags,
    };
  }

  async estimateMeal(userId: string, dto: MealEstimateDto) {
    await this.ensureActiveUser(userId);
    const conversation = await this.resolveConversation(
      userId,
      dto.conversationId,
      AiConversationType.MEAL_LOGGING,
      dto.message,
    );
    await this.prisma.aiMessage.create({
      data: {
        userId,
        conversationId: conversation.id,
        role: AiMessageRole.USER,
        content: dto.message,
      },
      select: { id: true },
    });
    const safetyFlags = detectSafetyFlags(dto.message);

    if (safetyFlags.blocked) {
      const assistant = await this.saveAssistantMessage({
        userId,
        conversationId: conversation.id,
        content: safetyFlags.message ?? 'I cannot estimate that safely.',
        safetyFlags,
      });

      return {
        conversationId: conversation.id,
        estimateId: null,
        status: AiMealEstimateStatus.NEEDS_CLARIFICATION,
        assistantMessage: assistant.content,
        estimate: null,
        safetyFlags,
      };
    }

    // Food Database first, now via the unified day-activity segmentation
    // pipeline (docs/16_Claude_Code_Handover.md): an exact whole-message DB
    // match still skips the AI provider entirely; anything else is segmented
    // into distinct FOOD and EXERCISE items with per-item resolved dates,
    // each food matched individually against the Food Database with its own
    // stated quantity, only still-unmatched foods going to a single batched
    // AI-estimate call, and exercise calories computed deterministically.
    // See food/meal-item-resolver.service.ts for the full pipeline.
    const userContext = await this.buildUserContext(userId);
    const resolution = await this.mealItemResolverService.resolveMeal(dto, {
      userContext: userContext.context,
      timezone: userContext.timezone,
      todayLocalDate: userContext.todayDate,
      currentWeightKg: userContext.currentWeightKg,
    });
    const persisted = await this.persistEstimate({
      userId,
      conversationId: conversation.id,
      originalText: dto.message,
      resolution,
      safetyFlags,
    });

    await this.touchConversation(conversation.id);

    return {
      conversationId: conversation.id,
      estimateId: persisted.estimateId,
      status: persisted.status,
      assistantMessage: persisted.assistantMessage.content,
      estimate: persisted.estimatePayload,
      safetyFlags,
    };
  }

  /**
   * chat()'s logging interception: runs the shared day-activity resolver and,
   * when it produced reviewable items, persists the estimate + assistant
   * message and returns a chat-shaped response carrying the same estimate
   * payload estimateMeal() returns (one shared estimate+confirm mechanism,
   * not a second divergent one). Returns null when segmentation found
   * nothing loggable so the caller falls through to a normal coaching reply.
   */
  private async tryBuildChatEstimate(input: {
    userId: string;
    conversationId: string;
    userMessageId: string;
    message: string;
    userContext: UserContextResult;
    safetyFlags: AiSafetyFlags;
  }) {
    const resolution = await this.mealItemResolverService.resolveMeal(
      { message: input.message },
      {
        userContext: input.userContext.context,
        timezone: input.userContext.timezone,
        todayLocalDate: input.userContext.todayDate,
        currentWeightKg: input.userContext.currentWeightKg,
      },
    );
    const structured = resolution.normalized.structured;
    const hasLoggableItems =
      structured.intent === 'MEAL_ESTIMATE' &&
      (structured.items.length > 0 || resolution.exerciseItems.length > 0);

    if (!hasLoggableItems) {
      return null;
    }

    const persisted = await this.persistEstimate({
      userId: input.userId,
      conversationId: input.conversationId,
      originalText: input.message,
      resolution,
      safetyFlags: input.safetyFlags,
    });

    await this.touchConversation(input.conversationId);

    return {
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      message: persisted.assistantMessage,
      suggestions: ['Log meal estimate', 'Review today', 'Plan next meal'],
      safetyFlags: input.safetyFlags,
      mealEstimate: {
        estimateId: persisted.estimateId,
        status: persisted.status,
        estimate: persisted.estimatePayload,
      },
    };
  }

  /**
   * Shared by estimateMeal() and chat()'s interception: saves the assistant
   * message and the confirmable AiMealEstimate row. Food and exercise items
   * are stored together in the estimate's `items` Json with an `itemType`
   * discriminator (FOOD rows predating this feature have no discriminator
   * and are treated as FOOD), so no schema migration is needed.
   */
  private async persistEstimate(input: {
    userId: string;
    conversationId: string;
    originalText: string;
    resolution: MealResolutionResult;
    safetyFlags: AiSafetyFlags;
  }) {
    const normalized = input.resolution.normalized;
    const exerciseItems = input.resolution.exerciseItems;
    const assistantMessage = await this.saveAssistantMessage({
      userId: input.userId,
      conversationId: input.conversationId,
      content: normalized.structured.reply,
      structured: {
        ...normalized.structured,
        exerciseItems,
      },
      model: input.resolution.providerModel,
      tokenInput: input.resolution.providerTokenInput,
      tokenOutput: input.resolution.providerTokenOutput,
      latencyMs: input.resolution.providerLatencyMs,
      safetyFlags: input.safetyFlags,
    });
    const storedItems = [
      ...normalized.structured.items.map((item) => ({
        itemType: 'FOOD' as const,
        ...item,
      })),
      ...exerciseItems.map((item) => ({
        itemType: 'EXERCISE' as const,
        ...item,
      })),
    ];
    const estimate = await this.prisma.aiMealEstimate.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: assistantMessage.id,
        originalText: input.originalText,
        mealType: normalized.structured.mealType,
        status: normalized.status,
        confidenceLevel: normalized.structured.confidenceLevel,
        confidenceScore: normalized.structured.confidenceScore,
        calories: Math.round(normalized.structured.totals.calories),
        proteinGrams: normalized.structured.totals.proteinGrams,
        carbsGrams: normalized.structured.totals.carbsGrams,
        fatGrams: normalized.structured.totals.fatGrams,
        fiberGrams: normalized.structured.totals.fiberGrams,
        items: storedItems,
        clarificationQuestions: normalized.structured.clarificationQuestions,
        assumptions: normalized.structured.assumptions,
        warnings: normalized.structured.warnings,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      assistantMessage,
      estimateId: estimate.id,
      status: estimate.status,
      estimatePayload: {
        originalText: input.originalText,
        mealType: normalized.structured.mealType,
        confidenceLevel: normalized.structured.confidenceLevel,
        confidenceScore: normalized.structured.confidenceScore,
        calories: Math.round(normalized.structured.totals.calories),
        proteinGrams: normalized.structured.totals.proteinGrams,
        carbsGrams: normalized.structured.totals.carbsGrams,
        fatGrams: normalized.structured.totals.fatGrams,
        fiberGrams: normalized.structured.totals.fiberGrams,
        items: normalized.structured.items,
        exerciseItems,
        clarificationQuestions: normalized.structured.clarificationQuestions,
        assumptions: normalized.structured.assumptions,
        warnings: normalized.structured.warnings,
      },
    };
  }

  async confirmMeal(userId: string, dto: MealConfirmDto) {
    await this.ensureActiveUser(userId);

    const confirmed = await this.prisma.$transaction(
      async (transaction) => {
        const estimate = await transaction.aiMealEstimate.findFirst({
          where: { id: dto.estimateId, userId },
        });

        if (!estimate) {
          throw new NotFoundException('Meal estimate not found');
        }

        if (estimate.status === AiMealEstimateStatus.CONFIRMED) {
          throw new BadRequestException('Meal estimate already confirmed');
        }

        const stored = splitStoredEstimateItems(estimate.items);
        // Corrections replace the FOOD side of the estimate (existing
        // behavior); exercise items are confirmed as estimated.
        const foodItems = dto.corrections?.items
          ? dto.corrections.items.map(toEstimateItem)
          : stored.foodItems;

        if (foodItems.length === 0 && stored.exerciseItems.length === 0) {
          throw new BadRequestException('Meal estimate is not confirmable');
        }

        // Per-item resolved dates are anchored to the user's local calendar
        // (dashboard-timezone.ts): "kal maine X khaya" must create a log dated
        // yesterday, not today.
        const profile = await transaction.userProfile.findUnique({
          where: { userId },
          select: { timezone: true },
        });
        const timezone = profile?.timezone ?? 'Asia/Karachi';
        const todayDate = getTodayRangeForTimezone(timezone).date;
        const overrideLoggedAt = dto.corrections?.loggedAt
          ? new Date(dto.corrections.loggedAt)
          : null;
        const resolveLoggedAt = (resolvedDate: string | null | undefined) => {
          if (overrideLoggedAt) {
            return overrideLoggedAt;
          }

          // Unspecified or explicitly-today items keep the previous behavior
          // (logged at the current instant); only back-dated items move.
          if (!resolvedDate || resolvedDate === todayDate) {
            return new Date();
          }

          return getUtcInstantForLocalDate(timezone, resolvedDate);
        };

        const status =
          estimate.status === AiMealEstimateStatus.NEEDS_CLARIFICATION ||
          estimate.confidenceLevel === ConfidenceLevel.LOW
            ? MealLogStatus.NEEDS_REVIEW
            : MealLogStatus.ESTIMATED;
        const fallbackMealType =
          dto.corrections?.mealType ?? estimate.mealType ?? MealType.CUSTOM;
        // One MealLog per (resolved date, meal of the day) group, so a message
        // spanning several meals/days lands as separate, correctly-dated logs.
        // Created in parallel (not a sequential for-loop): a message describing
        // a whole day can produce several groups plus several exercise rows,
        // and awaiting each round-trip one at a time toward a remote DB was
        // enough added latency to blow Prisma's 5s interactive-transaction
        // timeout - a real bug this multi-item confirm design introduced,
        // caught live-testing the exact reported multi-meal message.
        const groups = groupFoodItemsForLogging(foodItems, fallbackMealType);
        const createdMealLogs: MealLogWithItems[] = await Promise.all(
          groups.map((group) => {
            const totals = calculateTotals(group.items);

            return transaction.mealLog.create({
              data: {
                userId,
                mealType: group.mealType,
                loggedAt: resolveLoggedAt(group.resolvedDate),
                source: MealLogSource.AI_CHAT,
                status,
                confidenceLevel: estimate.confidenceLevel,
                description: estimate.originalText.slice(0, 200),
                note: 'Created from DailyFit Coach AI meal estimate.',
                totalCalories: totals.calories,
                totalProteinGrams: totals.proteinGrams,
                totalCarbsGrams: totals.carbsGrams,
                totalFatGrams: totals.fatGrams,
                items: {
                  create: group.items.map((item) => ({
                    foodName: item.name,
                    portionLabel: item.quantityText,
                    calories: item.calories,
                    proteinGrams: item.proteinGrams,
                    carbsGrams: item.carbsGrams,
                    fatGrams: item.fatGrams,
                    confidenceLevel: estimate.confidenceLevel,
                  })),
                },
              },
              select: mealLogSafeSelect,
            });
          }),
        );

        // Same estimate-then-confirm pattern as meals: rows are only written
        // here, after the user pressed Confirm - never directly from chat.
        // Source stays MANUAL because ExerciseLogSource has no AI value and
        // adding one would need a schema migration (deliberately avoided); the
        // note marks the real origin.
        const createdExerciseLogsRaw = await Promise.all(
          stored.exerciseItems.map((item) =>
            transaction.exerciseLog.create({
              data: {
                userId,
                exerciseType: item.exerciseType,
                durationMinutes: item.durationMinutes,
                steps: item.steps,
                distanceKm: item.distanceKm,
                estimatedCaloriesBurned: item.estimatedCaloriesBurned,
                loggedAt: resolveLoggedAt(item.resolvedDate),
                source: ExerciseLogSource.MANUAL,
                note: 'Created from DailyFit Coach AI estimate.',
              },
              select: {
                id: true,
                exerciseType: true,
                durationMinutes: true,
                steps: true,
                distanceKm: true,
                estimatedCaloriesBurned: true,
                loggedAt: true,
              },
            }),
          ),
        );
        const createdExerciseLogs: ConfirmedExerciseLogResponse[] =
          createdExerciseLogsRaw.map((log) => ({
            ...log,
            distanceKm: log.distanceKm === null ? null : Number(log.distanceKm),
          }));

        await transaction.aiMealEstimate.update({
          where: { id: estimate.id },
          data: {
            status: AiMealEstimateStatus.CONFIRMED,
            confirmedAt: new Date(),
            mealLogId: createdMealLogs[0]?.id ?? null,
          },
          select: { id: true },
        });

        return { createdMealLogs, createdExerciseLogs };
      },
      // A message describing a full day can produce several MealLog/
      // ExerciseLog writes in this transaction; even parallelized, a remote
      // DB's round-trip latency can approach Prisma's 5s default - a
      // generous margin avoids a repeat of the timeout bug above without
      // masking a genuinely stuck query (still fails loudly past 15s).
      { timeout: 15000 },
    );

    const mealLogs = confirmed.createdMealLogs.map(toMealLogResponse);
    const caloriesBurned = confirmed.createdExerciseLogs.reduce(
      (total, log) => total + (log.estimatedCaloriesBurned ?? 0),
      0,
    );

    return {
      mealLogs,
      exerciseLogs: confirmed.createdExerciseLogs,
      totals: {
        calories: mealLogs.reduce((total, log) => total + log.totalCalories, 0),
        proteinGrams: mealLogs.reduce(
          (total, log) => total + log.totalProteinGrams,
          0,
        ),
        caloriesBurned,
      },
      todayCalorieBalance: await this.getTodayCalorieBalance(userId),
    };
  }

  /** Post-confirm deficit/surplus snapshot for the success card, reusing the
   * dashboard's single source of truth rather than recomputing here. */
  private async getTodayCalorieBalance(userId: string) {
    try {
      const today = await this.dashboardService.getToday(userId);

      return today.calorieBalance;
    } catch {
      // The confirm itself succeeded; a balance snapshot is a nice-to-have.
      return null;
    }
  }

  async listConversations(userId: string, query: ListConversationsQueryDto) {
    await this.ensureActiveUser(userId);
    const conversations = await this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: query.limit ?? 20,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      type: conversation.type,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessagePreview:
        conversation.messages[0]?.content.slice(0, 140) ?? null,
    }));
  }

  async getConversation(userId: string, id: string) {
    await this.ensureActiveUser(userId);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            structured: true,
            model: true,
            latencyMs: true,
            safetyFlags: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        type: conversation.type,
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      messages: conversation.messages,
    };
  }

  async archiveConversation(userId: string, id: string): Promise<null> {
    await this.ensureActiveUser(userId);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('AI conversation not found');
    }

    await this.prisma.aiConversation.update({
      where: { id },
      data: { status: AiConversationStatus.ARCHIVED },
      select: { id: true },
    });

    return null;
  }

  private async resolveConversation(
    userId: string,
    conversationId: string | undefined,
    type: AiConversationType,
    firstMessage: string,
  ) {
    if (conversationId) {
      const conversation = await this.prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true, type: true, status: true },
      });

      if (
        !conversation ||
        conversation.status === AiConversationStatus.ARCHIVED
      ) {
        throw new NotFoundException('AI conversation not found');
      }

      return conversation;
    }

    return this.prisma.aiConversation.create({
      data: {
        userId,
        type,
        title: firstMessage.slice(0, 80),
      },
      select: { id: true, type: true, status: true },
    });
  }

  private async saveAssistantMessage(input: {
    userId: string;
    conversationId: string;
    content: string;
    structured?: unknown;
    model?: string;
    tokenInput?: number;
    tokenOutput?: number;
    latencyMs?: number;
    safetyFlags?: AiSafetyFlags;
  }) {
    return this.prisma.aiMessage.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        role: AiMessageRole.ASSISTANT,
        content: input.content,
        structured: input.structured as Prisma.InputJsonValue,
        model: input.model,
        tokenInput: input.tokenInput,
        tokenOutput: input.tokenOutput,
        latencyMs: input.latencyMs,
        safetyFlags: input.safetyFlags as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });
  }

  /**
   * Returns a bounded window of prior messages in this conversation (the
   * just-saved incoming user message excluded), oldest first, each truncated
   * so long messages cannot inflate the prompt.
   */
  private async getRecentConversationHistory(
    conversationId: string,
    excludeMessageId: string,
  ): Promise<string> {
    const messages = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        id: { not: excludeMessageId },
        role: { in: [AiMessageRole.USER, AiMessageRole.ASSISTANT] },
      },
      orderBy: { createdAt: 'desc' },
      take: chatHistoryMessageLimit,
      select: { role: true, content: true },
    });

    return messages
      .reverse()
      .map(
        (message) =>
          `${message.role}: ${truncateText(message.content, chatHistoryMessageMaxChars)}`,
      )
      .join('\n');
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt !== null) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  private async buildUserContext(userId: string): Promise<UserContextResult> {
    const [user, today] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          fullName: true,
          profile: {
            select: {
              gender: true,
              dateOfBirth: true,
              heightCm: true,
              goalType: true,
              goalPace: true,
              activityLevel: true,
              calorieTarget: true,
              proteinTargetGrams: true,
              currentWeightKg: true,
              targetWeightKg: true,
            },
          },
          onboarding: { select: { status: true } },
          weightLogs: {
            orderBy: { loggedAt: 'desc' },
            take: 3,
            select: { weightKg: true, loggedAt: true },
          },
          mealLogs: {
            orderBy: { loggedAt: 'desc' },
            take: 3,
            select: {
              mealType: true,
              totalCalories: true,
              totalProteinGrams: true,
              loggedAt: true,
            },
          },
        },
      }),
      this.dashboardService.getToday(userId),
    ]);

    const profile = user?.profile;
    // Latest logged weight wins over the onboarding snapshot, matching dashboard behavior.
    const currentWeightKg =
      toNullableNumber(user?.weightLogs[0]?.weightKg) ??
      toNullableNumber(profile?.currentWeightKg);
    const heightCm = toNullableNumber(profile?.heightCm);

    const missingFields: string[] = [];
    if (!profile?.gender) missingFields.push('gender');
    if (!profile?.dateOfBirth) missingFields.push('dateOfBirth');
    if (heightCm === null) missingFields.push('heightCm');
    if (currentWeightKg === null) missingFields.push('currentWeightKg');
    if (!profile?.activityLevel) missingFields.push('activityLevel');

    const canComputeBmr =
      Boolean(profile?.gender) &&
      Boolean(profile?.dateOfBirth) &&
      heightCm !== null &&
      currentWeightKg !== null;
    const rawBmr = canComputeBmr
      ? calculateBmr({
          gender: profile!.gender!,
          dateOfBirth: profile!.dateOfBirth!,
          heightCm: heightCm,
          weightKg: currentWeightKg,
        })
      : null;
    const tdeeKcal =
      rawBmr !== null && profile?.activityLevel
        ? Math.round(calculateTdee(rawBmr, profile.activityLevel))
        : null;
    // Positive = deficit. Shared formula with the dashboard card
    // (common/utils/calorie-balance.util.ts) - never recomputed differently.
    const estimatedDeficitKcal = calculateCalorieDeficitKcal({
      tdeeKcal,
      caloriesConsumed: today.todayProgress.calories.consumed,
      exerciseCaloriesBurned:
        today.todayProgress.exercise.estimatedCaloriesBurned,
    });

    const context = JSON.stringify({
      fullName: user?.fullName,
      onboardingStatus: user?.onboarding?.status,
      profile: profile
        ? {
            gender: profile.gender,
            ageYears: profile.dateOfBirth
              ? calculateAge(profile.dateOfBirth)
              : null,
            heightCm,
            currentWeightKg,
            targetWeightKg: toNullableNumber(profile.targetWeightKg),
            goalType: profile.goalType,
            goalPace: profile.goalPace,
            activityLevel: profile.activityLevel,
            calorieTarget: toNullableNumber(profile.calorieTarget),
            proteinTargetGrams: toNullableNumber(profile.proteinTargetGrams),
          }
        : null,
      healthMetrics: {
        formula: 'Mifflin-St Jeor',
        bmrKcal: rawBmr === null ? null : Math.round(rawBmr),
        tdeeKcal,
        missingFields,
      },
      today: {
        date: today.date,
        timezone: today.timezone,
        caloriesConsumed: today.todayProgress.calories.consumed,
        calorieTarget: today.todayProgress.calories.target,
        caloriesRemaining: today.todayProgress.calories.remaining,
        proteinConsumedGrams: today.todayProgress.protein.consumedGrams,
        proteinTargetGrams: today.todayProgress.protein.targetGrams,
        proteinRemainingGrams: today.todayProgress.protein.remainingGrams,
        waterConsumedMl: today.todayProgress.water.consumedMl,
        waterTargetMl: today.todayProgress.water.targetMl,
        exerciseMinutes: today.todayProgress.exercise.durationMinutes,
        exerciseCaloriesBurned:
          today.todayProgress.exercise.estimatedCaloriesBurned,
        estimatedDeficitKcal,
      },
      recentWeightLogs: user?.weightLogs.map((log) => ({
        weightKg: Number(log.weightKg),
        loggedAt: log.loggedAt,
      })),
      recentMealLogs: user?.mealLogs.map((log) => ({
        mealType: log.mealType,
        calories: Number(log.totalCalories),
        proteinGrams: Number(log.totalProteinGrams),
        loggedAt: log.loggedAt,
      })),
    });

    return {
      context,
      bmrKcal: rawBmr === null ? null : Math.round(rawBmr),
      currentWeightKg,
      targetWeightKg: toNullableNumber(profile?.targetWeightKg),
      timezone: today.timezone,
      todayDate: today.date,
    };
  }

  private getProviderConfig(): { model: string; timeoutMs: number } {
    return {
      model: this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
      timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000'),
    };
  }

  private async touchConversation(id: string): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: { id: true },
    });
  }
}

function toNullableNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

/** Minimal turn text for memory extraction: up to 1 prior exchange + this turn. */
function buildMemoryExtractionTurnText(
  recentHistory: string,
  userMessage: string,
  assistantReply: string,
): string {
  const priorLines = recentHistory
    ? recentHistory.split('\n').slice(-2).join('\n')
    : '';
  const currentTurn = `USER: ${userMessage}\nASSISTANT: ${assistantReply}`;

  return priorLines ? `${priorLines}\n${currentTurn}` : currentTurn;
}

/**
 * Splits an AiMealEstimate's stored `items` Json back into food and exercise
 * items via the `itemType` discriminator. Rows persisted before exercise
 * support have plain food objects with no discriminator - treated as FOOD,
 * preserving old estimates' confirm behavior exactly.
 */
function splitStoredEstimateItems(value: Prisma.JsonValue): {
  foodItems: MealEstimateItemOutput[];
  exerciseItems: ExerciseEstimateItemOutput[];
} {
  if (!Array.isArray(value)) {
    return { foodItems: [], exerciseItems: [] };
  }

  const foodItems: MealEstimateItemOutput[] = [];
  const exerciseItems: ExerciseEstimateItemOutput[] = [];

  for (const item of value) {
    const source = item as Record<string, unknown> | null;

    if (source && source.itemType === 'EXERCISE') {
      exerciseItems.push(toStoredExerciseItem(source));
    } else {
      foodItems.push(toEstimateItem(item));
    }
  }

  return { foodItems, exerciseItems };
}

const exerciseTypes = new Set<string>(Object.values(ExerciseType));
const mealSlotTypes = new Set<string>(Object.values(MealType));

function toStoredExerciseItem(
  source: Record<string, unknown>,
): ExerciseEstimateItemOutput {
  const durationMinutes = Number(source.durationMinutes);

  return {
    name: (typeof source.name === 'string' ? source.name : 'Exercise').slice(
      0,
      150,
    ),
    exerciseType:
      typeof source.exerciseType === 'string' &&
      exerciseTypes.has(source.exerciseType)
        ? (source.exerciseType as ExerciseType)
        : ExerciseType.OTHER,
    durationMinutes:
      Number.isFinite(durationMinutes) && durationMinutes >= 1
        ? Math.min(Math.round(durationMinutes), 1440)
        : 30,
    distanceKm: toStoredNullableNumber(source.distanceKm),
    steps: toStoredNullableNumber(source.steps),
    estimatedCaloriesBurned: toStoredNullableNumber(
      source.estimatedCaloriesBurned,
    ),
    resolvedDate: toStoredResolvedDate(source.resolvedDate),
    assumptions: [],
  };
}

function toStoredNullableNumber(value: unknown): number | null {
  const numeric = Number(value);

  return value === null || value === undefined || !Number.isFinite(numeric)
    ? null
    : numeric;
}

function toStoredResolvedDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function toEstimateItem(item: unknown): MealEstimateItemOutput {
  const source = item as Partial<MealConfirmItemDto & MealEstimateItemOutput>;

  return {
    name: String(source.name ?? 'Food item').slice(0, 150),
    quantityText: String(source.quantityText ?? 'estimated portion').slice(
      0,
      100,
    ),
    calories: Number(source.calories ?? 0),
    proteinGrams: Number(source.proteinGrams ?? 0),
    carbsGrams: Number(source.carbsGrams ?? 0),
    fatGrams: Number(source.fatGrams ?? 0),
    fiberGrams:
      source.fiberGrams === undefined || source.fiberGrams === null
        ? null
        : Number(source.fiberGrams),
    assumptions: [],
    resolvedDate: toStoredResolvedDate(
      (source as MealEstimateItemOutput).resolvedDate,
    ),
    mealSlot:
      typeof (source as MealEstimateItemOutput).mealSlot === 'string' &&
      mealSlotTypes.has((source as MealEstimateItemOutput).mealSlot as string)
        ? (source as MealEstimateItemOutput).mealSlot
        : null,
  };
}

interface FoodLogGroup {
  resolvedDate: string | null;
  mealType: MealType;
  items: MealEstimateItemOutput[];
}

/**
 * Groups confirmable food items by (resolved date, meal of the day) so a
 * single message describing a whole day ("breakfast X, lunch Y ... kal")
 * produces one correctly-typed MealLog per meal per day, in stable
 * first-appearance order.
 */
function groupFoodItemsForLogging(
  items: MealEstimateItemOutput[],
  fallbackMealType: MealType,
): FoodLogGroup[] {
  const groups = new Map<string, FoodLogGroup>();

  for (const item of items) {
    const resolvedDate = item.resolvedDate ?? null;
    const mealType = item.mealSlot ?? fallbackMealType;
    const key = `${resolvedDate ?? 'today'}|${mealType}`;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { resolvedDate, mealType, items: [item] });
    }
  }

  return [...groups.values()];
}

function calculateTotals(items: MealEstimateItemOutput[]): {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
} {
  return {
    calories: items.reduce((total, item) => total + item.calories, 0),
    proteinGrams: items.reduce((total, item) => total + item.proteinGrams, 0),
    carbsGrams: items.reduce((total, item) => total + item.carbsGrams, 0),
    fatGrams: items.reduce((total, item) => total + item.fatGrams, 0),
  };
}

function toMealLogResponse(mealLog: MealLogWithItems): MealLogResponse {
  return {
    id: mealLog.id,
    mealType: mealLog.mealType,
    description: mealLog.description,
    totalCalories: Number(mealLog.totalCalories),
    totalProteinGrams: Number(mealLog.totalProteinGrams),
    totalCarbsGrams:
      mealLog.totalCarbsGrams === null ? null : Number(mealLog.totalCarbsGrams),
    totalFatGrams:
      mealLog.totalFatGrams === null ? null : Number(mealLog.totalFatGrams),
    status: mealLog.status,
    confidenceLevel: mealLog.confidenceLevel,
    source: mealLog.source,
    loggedAt: mealLog.loggedAt,
    note: mealLog.note,
    createdAt: mealLog.createdAt,
    updatedAt: mealLog.updatedAt,
    items: mealLog.items.map((item) => ({
      id: item.id,
      foodName: item.foodName,
      portionLabel: item.portionLabel,
      quantity: item.quantity === null ? null : Number(item.quantity),
      calories: Number(item.calories),
      proteinGrams: Number(item.proteinGrams),
      carbsGrams: item.carbsGrams === null ? null : Number(item.carbsGrams),
      fatGrams: item.fatGrams === null ? null : Number(item.fatGrams),
      confidenceLevel: item.confidenceLevel,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}
