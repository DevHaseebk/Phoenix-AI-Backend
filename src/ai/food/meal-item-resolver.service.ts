import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDER,
  MealEstimateItemOutput,
  MealItemSegment,
} from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import { MealEstimateDto } from '../dto/meal-estimate.dto';
import { mealEstimatePrompt } from '../prompts/meal-estimate.prompt';
import { mealItemEstimateBatchPrompt } from '../prompts/meal-item-estimate-batch.prompt';
import { mealSegmentationPrompt } from '../prompts/meal-segmentation.prompt';
import { formatKnowledgeBlock, RagService } from '../rag/rag.service';
import { buildMealEstimatePrompt } from '../utils/meal-estimate-prompt.util';
import {
  normalizeMealEstimate,
  NormalizedMealEstimate,
} from '../utils/nutrition-sanity.util';
import { FoodMatchingService } from './food-matching.service';
import {
  buildCombinedRawEstimate,
  buildMissingItemsPrompt,
  buildPassthroughRawEstimate,
  buildSingleItemEstimate,
  mapBatchEstimateToItems,
  normalizeSegmentation,
} from './meal-item-resolver.util';
import { UnknownFoodQueueService } from './unknown-food-queue.service';
import { normalizeFoodText } from './utils/food-normalize.util';

const mealEstimateKnowledgeTopK = 3;

export interface MealResolutionResult {
  normalized: NormalizedMealEstimate;
  providerModel?: string;
  providerTokenInput?: number;
  providerTokenOutput?: number;
  providerLatencyMs?: number;
}

/**
 * Owns estimateMeal()'s AI-calling pipeline (docs/16_Claude_Code_Handover.md
 * multi-item segmentation fix): segment the raw message into distinct food
 * items -> match each individually against the Food Database with its own
 * stated quantity -> batch-estimate whatever's left in one call -> combine.
 * Replaces the old behavior of matching the whole raw message as if it were
 * one food, which silently dropped every other item in a multi-food message.
 */
@Injectable()
export class MealItemResolverService {
  private readonly logger = new Logger(MealItemResolverService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly ragService: RagService,
    private readonly foodMatchingService: FoodMatchingService,
    private readonly unknownFoodQueueService: UnknownFoodQueueService,
  ) {}

  async resolveMeal(
    dto: MealEstimateDto,
    userContext: string,
  ): Promise<MealResolutionResult> {
    // Fast path: an EXACT whole-message alias match is unambiguous (the
    // entire portion-stripped message literally equals a known alias, so
    // there is no room for another food to be hiding in the text) - trust
    // it directly and skip AI entirely, exactly as before this fix.
    // CONTAINMENT matches are NOT trusted here: a short alias found as a
    // substring of a longer message is exactly how the original bug matched
    // only "low fat milk" inside "2 boiled egg 100gm oats and 200gm low fat
    // milk" and silently dropped the rest - those now always fall through
    // to segmentation below.
    const wholeMessageMatch = await this.foodMatchingService.resolveMatch(
      dto.message,
      dto.mealType,
    );

    if (wholeMessageMatch?.matchTier === 'EXACT') {
      return {
        normalized: normalizeMealEstimate(
          wholeMessageMatch.structured,
          dto.mealType,
        ),
      };
    }

    if (!this.aiProvider.segmentMealItems) {
      // Providers without segmentation support (e.g. LocalAiProvider) keep
      // the previous single-call, whole-message behavior.
      return this.legacySingleCallEstimate(dto, userContext);
    }

    const knowledgeSection = await this.buildKnowledgeSection(dto.message);
    const segmentationResponse = await this.aiProvider.segmentMealItems({
      systemPrompt: mealSegmentationPrompt,
      userPrompt: `User context (authoritative app data):\n${userContext}${knowledgeSection}\n\nMeal request:\n${buildMealEstimatePrompt(dto)}`,
      ...this.getProviderConfig(),
    });
    const segmentation = normalizeSegmentation(segmentationResponse.structured);

    if (
      segmentation.intent !== 'MEAL_ITEMS' ||
      segmentation.items.length === 0
    ) {
      const raw = buildPassthroughRawEstimate(segmentation, dto.mealType);

      return {
        normalized: normalizeMealEstimate(raw, dto.mealType),
        providerModel: segmentationResponse.model,
        providerTokenInput: segmentationResponse.tokenInput,
        providerTokenOutput: segmentationResponse.tokenOutput,
        providerLatencyMs: segmentationResponse.latencyMs,
      };
    }

    return this.resolveSegments(
      segmentation.items,
      dto,
      knowledgeSection,
      segmentationResponse,
    );
  }

  private async resolveSegments(
    segments: MealItemSegment[],
    dto: MealEstimateDto,
    knowledgeSection: string,
    segmentationResponse: {
      model: string;
      tokenInput?: number;
      tokenOutput?: number;
      latencyMs: number;
    },
  ): Promise<MealResolutionResult> {
    const matchResults = await Promise.all(
      segments.map((segment) =>
        this.foodMatchingService.resolveMatch(segment.text, dto.mealType, {
          quantity: segment.quantity,
          unit: segment.unit,
        }),
      ),
    );

    const resolvedItems: (MealEstimateItemOutput | null)[] =
      new Array<MealEstimateItemOutput | null>(segments.length).fill(null);
    const confidenceSources: Array<{
      confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      confidenceScore: number;
    }> = [];
    const missingSegments: MealItemSegment[] = [];
    const missingIndexes: number[] = [];

    matchResults.forEach((match, index) => {
      if (match) {
        resolvedItems[index] = match.structured.items[0];
        confidenceSources.push({
          confidenceLevel: match.structured.confidenceLevel,
          confidenceScore: match.structured.confidenceScore,
        });
      } else {
        missingSegments.push(segments[index]);
        missingIndexes.push(index);
      }
    });

    let providerModel = segmentationResponse.model;
    let providerTokenInput = segmentationResponse.tokenInput ?? 0;
    let providerTokenOutput = segmentationResponse.tokenOutput ?? 0;
    let providerLatencyMs = segmentationResponse.latencyMs;

    if (missingSegments.length > 0) {
      // One batched call for every unmatched item in this meal (mirrors
      // meal-plan.service.ts's suggestMealsViaAi()) - never one call per item.
      const batchResponse = await this.aiProvider.generateMealEstimate({
        systemPrompt: mealItemEstimateBatchPrompt,
        userPrompt: `${buildMissingItemsPrompt(missingSegments)}${knowledgeSection}`,
        ...this.getProviderConfig(),
      });
      const batchNormalized = normalizeMealEstimate(
        batchResponse.structured,
        dto.mealType,
      );
      const mappedItems = mapBatchEstimateToItems(
        batchNormalized.structured,
        missingSegments,
      );

      missingIndexes.forEach((originalIndex, i) => {
        resolvedItems[originalIndex] = mappedItems[i];
      });
      confidenceSources.push({
        confidenceLevel: batchNormalized.structured.confidenceLevel,
        confidenceScore: batchNormalized.structured.confidenceScore,
      });

      providerModel = batchResponse.model;
      providerTokenInput += batchResponse.tokenInput ?? 0;
      providerTokenOutput += batchResponse.tokenOutput ?? 0;
      providerLatencyMs += batchResponse.latencyMs;

      // Queue each still-unresolved food individually (not the whole
      // message), so review/import tooling sees the actual missing food.
      await Promise.all(
        missingSegments.map((segment, i) =>
          this.unknownFoodQueueService.recordSighting({
            normalizedText: normalizeFoodText(segment.text),
            aiEstimate: buildSingleItemEstimate(mappedItems[i], dto.mealType),
          }),
        ),
      );
    }

    const finalItems = resolvedItems as MealEstimateItemOutput[];
    const dbCount = segments.length - missingSegments.length;
    const aiCount = missingSegments.length;
    const raw = buildCombinedRawEstimate(
      finalItems,
      dbCount,
      aiCount,
      confidenceSources,
      dto.mealType,
    );

    this.logger.debug(
      `Resolved meal "${dto.message}" into ${segments.length} item(s): ${dbCount} from Food DB, ${aiCount} via AI.`,
    );

    return {
      normalized: normalizeMealEstimate(raw, dto.mealType),
      providerModel,
      providerTokenInput,
      providerTokenOutput,
      providerLatencyMs,
    };
  }

  /** Preserves the original single-call, whole-message behavior for providers without segmentMealItems(). */
  private async legacySingleCallEstimate(
    dto: MealEstimateDto,
    userContext: string,
  ): Promise<MealResolutionResult> {
    const knowledgeSection = await this.buildKnowledgeSection(dto.message);
    const providerResponse = await this.aiProvider.generateMealEstimate({
      systemPrompt: mealEstimatePrompt,
      userPrompt: `User context (authoritative app data):\n${userContext}${knowledgeSection}\n\nMeal request:\n${buildMealEstimatePrompt(dto)}`,
      ...this.getProviderConfig(),
    });
    const normalized = normalizeMealEstimate(
      providerResponse.structured,
      dto.mealType,
    );

    if (normalized.structured.intent === 'MEAL_ESTIMATE') {
      await this.unknownFoodQueueService.recordSighting({
        normalizedText: normalizeFoodText(dto.message),
        aiEstimate: normalized.structured,
      });
    }

    return {
      normalized,
      providerModel: providerResponse.model,
      providerTokenInput: providerResponse.tokenInput,
      providerTokenOutput: providerResponse.tokenOutput,
      providerLatencyMs: providerResponse.latencyMs,
    };
  }

  private async buildKnowledgeSection(message: string): Promise<string> {
    const knowledgeChunks = await this.ragService.retrieveRelevantChunks(
      message,
      mealEstimateKnowledgeTopK,
    );

    return knowledgeChunks.length > 0
      ? `\n\nFood knowledge (general reference material retrieved for this meal; not user data):\n${formatKnowledgeBlock(knowledgeChunks)}`
      : '';
  }

  private getProviderConfig(): { model: string; timeoutMs: number } {
    return {
      model: this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
      timeoutMs: Number(this.config.get<string>('AI_TIMEOUT_MS') ?? '30000'),
    };
  }
}
