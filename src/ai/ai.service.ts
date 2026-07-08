import {
  BadRequestException,
  Inject,
  Injectable,
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
  MealLogSource,
  MealLogStatus,
  MealType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import {
  AI_PROVIDER,
  AiSafetyFlags,
  MealEstimateItemOutput,
} from './ai-provider.interface';
import type { AiProvider } from './ai-provider.interface';
import { ChatDto } from './dto/chat.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { MealConfirmDto, MealConfirmItemDto } from './dto/meal-confirm.dto';
import { MealEstimateDto } from './dto/meal-estimate.dto';
import { dailyFitSystemPrompt } from './prompts/dailyfit-system.prompt';
import { mealEstimatePrompt } from './prompts/meal-estimate.prompt';
import { detectSafetyFlags } from './utils/ai-safety.util';
import { normalizeMealEstimate } from './utils/nutrition-sanity.util';
import { formatMemoryBlock, MemoryService } from './memory/memory.service';
import { formatKnowledgeBlock, RagService } from './rag/rag.service';
import {
  calculateAge,
  calculateBmr,
  calculateTdee,
} from '../common/utils/health-metrics.util';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

/** Bounded conversation-history window sent to the model per chat turn. */
const chatHistoryMessageLimit = 10;
/** Per-message truncation cap so one long message cannot blow up the prompt. */
const chatHistoryMessageMaxChars = 500;
const chatKnowledgeTopK = 4;
const mealEstimateKnowledgeTopK = 3;
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

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly dashboardService: DashboardService,
    private readonly ragService: RagService,
    private readonly memoryService: MemoryService,
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

    const [context, knowledgeChunks, memories, recentHistory] =
      await Promise.all([
        this.buildUserContext(userId),
        this.ragService.retrieveRelevantChunks(dto.message, chatKnowledgeTopK),
        this.memoryService.retrieveRelevantMemories(
          userId,
          dto.message,
          chatMemoryTopK,
        ),
        this.getRecentConversationHistory(conversation.id, userMessage.id),
      ]);
    const promptSections = [
      `User context (authoritative app data):\n${context}`,
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
    const assistant = await this.saveAssistantMessage({
      userId,
      conversationId: conversation.id,
      content: providerResponse.content,
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

    const [context, knowledgeChunks] = await Promise.all([
      this.buildUserContext(userId),
      this.ragService.retrieveRelevantChunks(
        dto.message,
        mealEstimateKnowledgeTopK,
      ),
    ]);
    const knowledgeSection =
      knowledgeChunks.length > 0
        ? `\n\nFood knowledge (general reference material retrieved for this meal; not user data):\n${formatKnowledgeBlock(knowledgeChunks)}`
        : '';
    const providerResponse = await this.aiProvider.generateMealEstimate({
      systemPrompt: mealEstimatePrompt,
      userPrompt: `User context (authoritative app data):\n${context}${knowledgeSection}\n\nMeal request:\n${buildMealEstimatePrompt(dto)}`,
      ...this.getProviderConfig(),
    });
    const normalized = normalizeMealEstimate(
      providerResponse.structured,
      dto.mealType,
    );
    const assistantMessage = await this.saveAssistantMessage({
      userId,
      conversationId: conversation.id,
      content: normalized.structured.reply,
      structured: normalized.structured,
      model: providerResponse.model,
      tokenInput: providerResponse.tokenInput,
      tokenOutput: providerResponse.tokenOutput,
      latencyMs: providerResponse.latencyMs,
      safetyFlags,
    });
    const estimate = await this.prisma.aiMealEstimate.create({
      data: {
        userId,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        originalText: dto.message,
        mealType: normalized.structured.mealType,
        status: normalized.status,
        confidenceLevel: normalized.structured.confidenceLevel,
        confidenceScore: normalized.structured.confidenceScore,
        calories: Math.round(normalized.structured.totals.calories),
        proteinGrams: normalized.structured.totals.proteinGrams,
        carbsGrams: normalized.structured.totals.carbsGrams,
        fatGrams: normalized.structured.totals.fatGrams,
        fiberGrams: normalized.structured.totals.fiberGrams,
        items: normalized.structured.items as unknown as Prisma.InputJsonValue,
        clarificationQuestions: normalized.structured.clarificationQuestions,
        assumptions: normalized.structured.assumptions,
        warnings: normalized.structured.warnings,
      },
      select: {
        id: true,
        status: true,
      },
    });

    await this.touchConversation(conversation.id);

    return {
      conversationId: conversation.id,
      estimateId: estimate.id,
      status: estimate.status,
      assistantMessage: assistantMessage.content,
      estimate: {
        originalText: dto.message,
        mealType: normalized.structured.mealType,
        confidenceLevel: normalized.structured.confidenceLevel,
        confidenceScore: normalized.structured.confidenceScore,
        calories: Math.round(normalized.structured.totals.calories),
        proteinGrams: normalized.structured.totals.proteinGrams,
        carbsGrams: normalized.structured.totals.carbsGrams,
        fatGrams: normalized.structured.totals.fatGrams,
        fiberGrams: normalized.structured.totals.fiberGrams,
        items: normalized.structured.items,
        clarificationQuestions: normalized.structured.clarificationQuestions,
        assumptions: normalized.structured.assumptions,
        warnings: normalized.structured.warnings,
      },
      safetyFlags,
    };
  }

  async confirmMeal(userId: string, dto: MealConfirmDto) {
    await this.ensureActiveUser(userId);

    const mealLog = await this.prisma.$transaction(async (transaction) => {
      const estimate = await transaction.aiMealEstimate.findFirst({
        where: { id: dto.estimateId, userId },
      });

      if (!estimate) {
        throw new NotFoundException('Meal estimate not found');
      }

      if (estimate.status === AiMealEstimateStatus.CONFIRMED) {
        throw new BadRequestException('Meal estimate already confirmed');
      }

      const items = dto.corrections?.items
        ? dto.corrections.items.map(toEstimateItem)
        : extractEstimateItems(estimate.items);

      if (items.length === 0) {
        throw new BadRequestException('Meal estimate is not confirmable');
      }

      const totals = calculateTotals(items);
      const mealType =
        dto.corrections?.mealType ?? estimate.mealType ?? MealType.CUSTOM;
      const status =
        estimate.status === AiMealEstimateStatus.NEEDS_CLARIFICATION ||
        estimate.confidenceLevel === ConfidenceLevel.LOW
          ? MealLogStatus.NEEDS_REVIEW
          : MealLogStatus.ESTIMATED;
      const createdMealLog = await transaction.mealLog.create({
        data: {
          userId,
          mealType,
          loggedAt: dto.corrections?.loggedAt
            ? new Date(dto.corrections.loggedAt)
            : new Date(),
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
            create: items.map((item) => ({
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

      await transaction.aiMealEstimate.update({
        where: { id: estimate.id },
        data: {
          status: AiMealEstimateStatus.CONFIRMED,
          confirmedAt: new Date(),
          mealLogId: createdMealLog.id,
        },
        select: { id: true },
      });

      return createdMealLog;
    });

    return toMealLogResponse(mealLog);
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

  private async buildUserContext(userId: string): Promise<string> {
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

    return JSON.stringify({
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

function buildMealEstimatePrompt(dto: MealEstimateDto): string {
  return JSON.stringify({
    message: dto.message,
    mealType: dto.mealType ?? null,
    loggedAt: dto.loggedAt ?? null,
  });
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

function extractEstimateItems(
  value: Prisma.JsonValue,
): MealEstimateItemOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => toEstimateItem(item)).filter(Boolean);
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
  };
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
