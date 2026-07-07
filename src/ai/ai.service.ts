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
import { PrismaService } from '../prisma/prisma.service';

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

    const context = await this.buildUserContext(userId);
    const providerResponse = await this.aiProvider.generateCoachReply({
      systemPrompt: dailyFitSystemPrompt,
      userPrompt: `${context}\n\nUser message:\n${dto.message}`,
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

    const providerResponse = await this.aiProvider.generateMealEstimate({
      systemPrompt: mealEstimatePrompt,
      userPrompt: buildMealEstimatePrompt(dto),
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        profile: {
          select: {
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
    });

    return JSON.stringify({
      fullName: user?.fullName,
      profile: user?.profile,
      onboardingStatus: user?.onboarding?.status,
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
