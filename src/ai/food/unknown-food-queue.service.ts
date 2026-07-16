import { Injectable } from '@nestjs/common';
import {
  FoodDataConfidence,
  FoodItem,
  Prisma,
  UnknownFoodQueueStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { MealEstimateStructuredOutput } from '../ai-provider.interface';

export interface UnknownFoodQueueItemResponse {
  id: string;
  rawText: string;
  aiSuggestedEstimate: Prisma.JsonValue | null;
  confidence: FoodDataConfidence | null;
  frequency: number;
  lastSeenAt: Date;
  suggestedCategory: string | null;
  status: UnknownFoodQueueStatus;
  linkedFoodItemId: string | null;
  linkedFoodItem: FoodItem | null;
  createdAt: Date;
  updatedAt: Date;
}

const includeLinkedFoodItem = { linkedFoodItem: true } as const;

@Injectable()
export class UnknownFoodQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a food the matcher couldn't resolve. Upserts on the normalized
   * text so repeat sightings increment frequency/lastSeenAt instead of
   * creating duplicate rows (confirmed live in this task's verification).
   */
  async recordSighting(params: {
    normalizedText: string;
    aiEstimate: MealEstimateStructuredOutput;
  }): Promise<void> {
    const { normalizedText, aiEstimate } = params;

    if (!normalizedText) {
      return;
    }

    await this.prisma.unknownFoodQueueItem.upsert({
      where: { rawText: normalizedText },
      create: {
        rawText: normalizedText,
        aiSuggestedEstimate: aiEstimate as unknown as Prisma.InputJsonValue,
        confidence: toFoodDataConfidence(aiEstimate.confidenceLevel),
        frequency: 1,
        lastSeenAt: new Date(),
        status: UnknownFoodQueueStatus.PENDING,
      },
      update: {
        aiSuggestedEstimate: aiEstimate as unknown as Prisma.InputJsonValue,
        confidence: toFoodDataConfidence(aiEstimate.confidenceLevel),
        frequency: { increment: 1 },
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
  }

  async list(
    status?: UnknownFoodQueueStatus,
  ): Promise<UnknownFoodQueueItemResponse[]> {
    const items = await this.prisma.unknownFoodQueueItem.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ frequency: 'desc' }, { lastSeenAt: 'desc' }],
      include: includeLinkedFoodItem,
    });

    return items;
  }

  /** `linkedFoodItemId` is only ever passed when transitioning to APPROVED
   * (see UnknownFoodsController.approve()) - omitted for every other
   * transition, so REJECTED/NEEDS_RESEARCH/PENDING never touch the column. */
  async setStatus(
    id: string,
    status: UnknownFoodQueueStatus,
    linkedFoodItemId?: string,
  ): Promise<UnknownFoodQueueItemResponse | null> {
    const existing = await this.prisma.unknownFoodQueueItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return null;
    }

    return this.prisma.unknownFoodQueueItem.update({
      where: { id },
      data: {
        status,
        ...(linkedFoodItemId === undefined ? {} : { linkedFoodItemId }),
      },
      include: includeLinkedFoodItem,
    });
  }

  async findById(id: string): Promise<UnknownFoodQueueItemResponse | null> {
    return this.prisma.unknownFoodQueueItem.findUnique({
      where: { id },
      include: includeLinkedFoodItem,
    });
  }
}

function toFoodDataConfidence(
  confidenceLevel: MealEstimateStructuredOutput['confidenceLevel'],
): FoodDataConfidence {
  return confidenceLevel === 'LOW'
    ? 'LOW'
    : confidenceLevel === 'HIGH'
      ? 'HIGH'
      : 'MEDIUM';
}
