import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDER,
  ExerciseEstimateItemOutput,
  MealEstimateItemOutput,
  MealItemSegment,
} from '../ai-provider.interface';
import type { AiProvider } from '../ai-provider.interface';
import { addDaysToLocalDate } from '../../dashboard/dashboard-timezone';
import { MealEstimateDto } from '../dto/meal-estimate.dto';
import { mealEstimatePrompt } from '../prompts/meal-estimate.prompt';
import { mealItemEstimateBatchPrompt } from '../prompts/meal-item-estimate-batch.prompt';
import { mealSegmentationPrompt } from '../prompts/meal-segmentation.prompt';
import { formatKnowledgeBlock, RagService } from '../rag/rag.service';
import { buildExerciseEstimateItem } from '../utils/exercise-activity.util';
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
/** MET-formula exercise estimates use a representative moderate intensity,
 * so they carry MEDIUM confidence into the combined estimate. */
const exerciseConfidence = {
  confidenceLevel: 'MEDIUM' as const,
  confidenceScore: 0.7,
};

export interface MealResolutionContext {
  /** Compact JSON user-context block from AiService.buildUserContext(). */
  userContext: string;
  /** User's local timezone + today's local date (dashboard-timezone.ts is
   * the canonical source) - injected into the segmentation call so relative
   * date phrases resolve to correct absolute dates. */
  timezone: string;
  todayLocalDate: string;
  /** Latest known weight, for deterministic MET calorie estimates. */
  currentWeightKg: number | null;
}

export interface MealResolutionResult {
  normalized: NormalizedMealEstimate;
  /** Deterministically-estimated exercise items extracted from the same
   * message (empty for food-only messages and legacy/fast paths). */
  exerciseItems: ExerciseEstimateItemOutput[];
  providerModel?: string;
  providerTokenInput?: number;
  providerTokenOutput?: number;
  providerLatencyMs?: number;
}

/**
 * Owns estimateMeal()'s AI-calling pipeline (docs/16_Claude_Code_Handover.md
 * multi-item segmentation fix, generalized to unified day-activity
 * segmentation): segment the raw message into distinct FOOD and EXERCISE
 * items with per-item resolved dates -> match each food individually against
 * the Food Database with its own stated quantity -> batch-estimate whatever
 * food is left in one call -> compute exercise calories deterministically
 * (MET formula, zero AI calls) -> combine. Replaces the old behavior of
 * matching the whole raw message as if it were one food, which silently
 * dropped every other item in a multi-item message.
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
    context: MealResolutionContext,
  ): Promise<MealResolutionResult> {
    // Fast path: an EXACT whole-message alias match is unambiguous (the
    // entire portion-stripped message literally equals a known alias, so
    // there is no room for another food - or an exercise mention - to be
    // hiding in the text) - trust it directly and skip AI entirely, exactly
    // as before this fix.
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
        exerciseItems: [],
      };
    }

    if (!this.aiProvider.segmentMealItems) {
      // Providers without segmentation support (e.g. LocalAiProvider) keep
      // the previous single-call, whole-message behavior.
      return this.legacySingleCallEstimate(dto, context.userContext);
    }

    const knowledgeSection = await this.buildKnowledgeSection(dto.message);
    const segmentationResponse = await this.aiProvider.segmentMealItems({
      systemPrompt: mealSegmentationPrompt,
      userPrompt: `User context (authoritative app data):\n${context.userContext}${knowledgeSection}\n\n${buildDateContextBlock(context)}\n\nMeal request:\n${buildMealEstimatePrompt(dto)}`,
      ...this.getProviderConfig(),
    });
    const segmentation = normalizeSegmentation(
      segmentationResponse.structured,
      context.todayLocalDate,
    );

    if (
      segmentation.intent !== 'MEAL_ITEMS' ||
      segmentation.items.length === 0
    ) {
      const raw = buildPassthroughRawEstimate(segmentation, dto.mealType);

      return {
        normalized: normalizeMealEstimate(raw, dto.mealType),
        exerciseItems: [],
        providerModel: segmentationResponse.model,
        providerTokenInput: segmentationResponse.tokenInput,
        providerTokenOutput: segmentationResponse.tokenOutput,
        providerLatencyMs: segmentationResponse.latencyMs,
      };
    }

    return this.resolveSegments(
      segmentation.items,
      dto,
      context,
      knowledgeSection,
      segmentationResponse,
    );
  }

  private async resolveSegments(
    segments: MealItemSegment[],
    dto: MealEstimateDto,
    context: MealResolutionContext,
    knowledgeSection: string,
    segmentationResponse: {
      model: string;
      tokenInput?: number;
      tokenOutput?: number;
      latencyMs: number;
    },
  ): Promise<MealResolutionResult> {
    const foodSegments = segments.filter(
      (segment) => segment.itemType !== 'EXERCISE',
    );
    // Exercise items are fully deterministic from here: type inferred by
    // keyword, calories via the existing MET util - zero extra AI calls.
    const exerciseItems = segments
      .filter((segment) => segment.itemType === 'EXERCISE')
      .map((segment) =>
        buildExerciseEstimateItem(segment, context.currentWeightKg),
      );

    const matchResults = await Promise.all(
      foodSegments.map((segment) =>
        this.foodMatchingService.resolveMatch(segment.text, dto.mealType, {
          quantity: segment.quantity,
          unit: segment.unit,
        }),
      ),
    );

    const resolvedItems: (MealEstimateItemOutput | null)[] =
      new Array<MealEstimateItemOutput | null>(foodSegments.length).fill(null);
    const confidenceSources: Array<{
      confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      confidenceScore: number;
    }> = [];
    const missingSegments: MealItemSegment[] = [];
    const missingIndexes: number[] = [];

    matchResults.forEach((match, index) => {
      if (match) {
        resolvedItems[index] = withItemPlacement(
          match.structured.items[0],
          foodSegments[index],
        );
        confidenceSources.push({
          confidenceLevel: match.structured.confidenceLevel,
          confidenceScore: match.structured.confidenceScore,
        });
      } else {
        missingSegments.push(foodSegments[index]);
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
        resolvedItems[originalIndex] = withItemPlacement(
          mappedItems[i],
          missingSegments[i],
        );
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

    exerciseItems.forEach(() => confidenceSources.push(exerciseConfidence));

    const finalItems = resolvedItems.filter(
      (item): item is MealEstimateItemOutput => item !== null,
    );
    const dbCount = foodSegments.length - missingSegments.length;
    const aiCount = missingSegments.length;
    const raw = buildCombinedRawEstimate(
      finalItems,
      dbCount,
      aiCount,
      confidenceSources,
      dto.mealType,
      exerciseItems,
    );

    this.logger.debug(
      `Resolved message "${dto.message}" into ${foodSegments.length} food item(s) (${dbCount} from Food DB, ${aiCount} via AI) and ${exerciseItems.length} exercise item(s).`,
    );

    return {
      normalized: normalizeMealEstimate(raw, dto.mealType),
      exerciseItems,
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
      exerciseItems: [],
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

/** The absolute dates the segmentation model resolves relative phrasing
 * against - always the user's own local calendar (dashboard-timezone.ts),
 * never the server's. */
function buildDateContextBlock(context: MealResolutionContext): string {
  return [
    `Date context: today's local date is ${context.todayLocalDate} (timezone ${context.timezone}).`,
    `Yesterday was ${addDaysToLocalDate(context.todayLocalDate, -1)}.`,
    `The day before yesterday was ${addDaysToLocalDate(context.todayLocalDate, -2)}.`,
  ].join(' ');
}

/** Attaches the segment's resolved day/meal placement to a matched or
 * AI-estimated food item so it survives into the stored estimate. */
function withItemPlacement(
  item: MealEstimateItemOutput,
  segment: MealItemSegment,
): MealEstimateItemOutput {
  return {
    ...item,
    resolvedDate: segment.date,
    mealSlot: segment.mealSlot,
  };
}
