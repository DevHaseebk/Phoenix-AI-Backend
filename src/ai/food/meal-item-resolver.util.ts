import { ConfidenceLevel, MealType } from '@prisma/client';
import {
  ExerciseEstimateItemOutput,
  MealEstimateItemOutput,
  MealEstimateStructuredOutput,
  MealItemSegment,
  MealSegmentationStructuredOutput,
} from '../ai-provider.interface';
import { addDaysToLocalDate } from '../../dashboard/dashboard-timezone';
import {
  asRecord,
  normalizeStringArray,
  normalizeText,
} from '../utils/nutrition-sanity.util';

const confidenceOrder: Record<ConfidenceLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  VERIFIED: 3,
};

export interface NormalizedSegmentation {
  intent: MealSegmentationStructuredOutput['intent'];
  items: MealItemSegment[];
  clarificationQuestions: string[];
  reply: string;
}

/** A resolved item date more than this many days back is treated as a model
 * error and dropped to null (= today): a single logging message naturally
 * describes the last day or two, and multi-day retroactive backfill is
 * explicitly out of scope. */
const maxResolvedDateAgeDays = 7;

/**
 * Defensive parse of the segmentation AI response, mirroring
 * nutrition-sanity.util.ts's approach. `todayLocalDate` (YYYY-MM-DD in the
 * user's timezone) bounds per-item resolved dates: invalid, future, or
 * older-than-a-week dates fall back to null, which downstream treats as
 * "today" - the safe default for unspecified dates.
 */
export function normalizeSegmentation(
  raw: unknown,
  todayLocalDate?: string,
): NormalizedSegmentation {
  const source = asRecord(raw);

  return {
    intent: normalizeSegmentationIntent(source.intent),
    items: normalizeSegmentationItems(source.items, todayLocalDate),
    clarificationQuestions: normalizeStringArray(source.clarificationQuestions),
    reply: normalizeText(
      source.reply,
      'Tell me what you ate and I can estimate it.',
    ),
  };
}

function normalizeSegmentationIntent(
  value: unknown,
): MealSegmentationStructuredOutput['intent'] {
  return value === 'MEAL_ITEMS' ||
    value === 'NOT_FOOD' ||
    value === 'CLARIFICATION_NEEDED'
    ? value
    : 'CLARIFICATION_NEEDED';
}

const mealSlots = new Set<string>([
  MealType.BREAKFAST,
  MealType.LUNCH,
  MealType.DINNER,
  MealType.SNACK,
]);

function normalizeSegmentationItems(
  value: unknown,
  todayLocalDate?: string,
): MealItemSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 20)
    .map((item) => {
      const source = asRecord(item);
      const text = normalizeText(source.text, '').slice(0, 150);

      return {
        // Absent/malformed itemType defaults to FOOD, so a provider (or
        // recorded fixture) predating exercise support keeps the exact
        // previous food-only behavior.
        itemType: source.itemType === 'EXERCISE' ? 'EXERCISE' : 'FOOD',
        text,
        quantity: normalizeNullableText(source.quantity),
        unit: normalizeNullableText(source.unit),
        mealSlot: normalizeMealSlot(source.mealSlot),
        durationMinutes: normalizeNullableInteger(
          source.durationMinutes,
          1,
          1440,
        ),
        distanceKm: normalizeNullableNumber(source.distanceKm, 0.01, 500),
        steps: normalizeNullableInteger(source.steps, 1, 100000),
        date: normalizeResolvedDate(source.date, todayLocalDate),
      } satisfies MealItemSegment;
    })
    .filter((segment) => segment.text.length > 0);
}

function normalizeMealSlot(value: unknown): MealType | null {
  return typeof value === 'string' && mealSlots.has(value)
    ? (value as MealType)
    : null;
}

/**
 * Accepts only a real YYYY-MM-DD calendar date; when today's local date is
 * known, also rejects future dates and dates older than a week (both are
 * model errors for a logging message). Rejected values become null = today.
 * Zero-padded ISO dates compare correctly as plain strings.
 */
function normalizeResolvedDate(
  value: unknown,
  todayLocalDate?: string,
): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));

  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() + 1 !== month ||
    asDate.getUTCDate() !== day
  ) {
    return null;
  }

  if (todayLocalDate) {
    if (value > todayLocalDate) {
      return null;
    }

    if (value < addDaysToLocalDate(todayLocalDate, -maxResolvedDateAgeDays)) {
      return null;
    }
  }

  return value;
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeNullableInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const rounded = Math.round(numeric);

  return rounded < min || rounded > max ? null : rounded;
}

function normalizeNullableNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}

/** Builds the numbered "estimate these specific foods" prompt for the batch-estimate-misses call. */
export function buildMissingItemsPrompt(segments: MealItemSegment[]): string {
  const list = segments
    .map((segment, index) => {
      const quantityNote =
        segment.quantity && segment.unit
          ? ` (stated quantity: ${segment.quantity} ${segment.unit})`
          : ' (no quantity stated - use a realistic default serving)';

      return `${index + 1}. ${segment.text}${quantityNote}`;
    })
    .join('\n');

  return `Estimate exactly one item for each of these ${segments.length} foods, in the same order:\n\nFoods:\n${list}`;
}

/**
 * Maps the batch AI-estimate response back onto the missing segments by
 * array position (mirrors meal-plan.service.ts's suggestMealsViaAi()
 * index-alignment pattern), degrading gracefully to a zero-value placeholder
 * per segment if the provider returned fewer items than requested.
 */
export function mapBatchEstimateToItems(
  structured: MealEstimateStructuredOutput,
  missingSegments: MealItemSegment[],
): MealEstimateItemOutput[] {
  return missingSegments.map((segment, index) => {
    const item = structured.items[index];

    if (item) {
      return item;
    }

    return {
      name: segment.text || 'Food item',
      quantityText:
        segment.quantity && segment.unit
          ? `${segment.quantity} ${segment.unit}`
          : 'estimated portion',
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      fiberGrams: null,
      assumptions: [
        'AI estimate was unavailable for this item; please review and correct manually.',
      ],
    };
  });
}

export function calculateItemTotals(
  items: MealEstimateItemOutput[],
): MealEstimateStructuredOutput['totals'] {
  const fiberValues = items
    .map((item) => item.fiberGrams)
    .filter((value): value is number => value !== null);

  return {
    calories: items.reduce((total, item) => total + item.calories, 0),
    proteinGrams: items.reduce((total, item) => total + item.proteinGrams, 0),
    carbsGrams: items.reduce((total, item) => total + item.carbsGrams, 0),
    fatGrams: items.reduce((total, item) => total + item.fatGrams, 0),
    fiberGrams:
      fiberValues.length === 0
        ? null
        : fiberValues.reduce((total, value) => total + value, 0),
  };
}

/** Weakest-link combination: overall confidence never exceeds the least confident contributing source. */
export function combineConfidence(
  sources: Array<{
    confidenceLevel: MealEstimateStructuredOutput['confidenceLevel'];
    confidenceScore: number;
  }>,
): {
  confidenceLevel: MealEstimateStructuredOutput['confidenceLevel'];
  confidenceScore: number;
} {
  if (sources.length === 0) {
    return { confidenceLevel: 'LOW', confidenceScore: 0.2 };
  }

  const weakest = sources.reduce((min, source) =>
    confidenceOrder[source.confidenceLevel] <
    confidenceOrder[min.confidenceLevel]
      ? source
      : min,
  );
  const averageScore =
    sources.reduce((total, source) => total + source.confidenceScore, 0) /
    sources.length;

  return {
    confidenceLevel: weakest.confidenceLevel,
    confidenceScore: Math.min(weakest.confidenceScore, averageScore),
  };
}

/**
 * Builds a reply that honestly reflects mixed DB/AI sourcing - never claims
 * the whole meal came from the food database when only some items did (the
 * exact bug this resolver fixes: docs/16_Claude_Code_Handover.md) - and now
 * also acknowledges exercise items and back-dated items instead of silently
 * dropping them.
 */
export function buildCombinedReply(
  items: MealEstimateItemOutput[],
  totals: MealEstimateStructuredOutput['totals'],
  dbCount: number,
  aiCount: number,
  exerciseItems: ExerciseEstimateItemOutput[] = [],
): string {
  const parts: string[] = [];

  if (items.length > 0) {
    const itemSummaries = items
      .map((item) => `${item.name} (${item.quantityText})`)
      .join(', ');
    const sourceNote =
      aiCount === 0
        ? 'All items matched from our food database.'
        : dbCount === 0
          ? "Estimated by AI since these aren't in our food database yet."
          : `${dbCount} item${dbCount === 1 ? '' : 's'} matched from our food database, ${aiCount} estimated by AI.`;

    parts.push(
      `${itemSummaries}: about ${Math.round(totals.calories)} kcal and ${Math.round(totals.proteinGrams * 10) / 10}g protein. ${sourceNote}`,
    );
  }

  if (exerciseItems.length > 0) {
    const exerciseSummaries = exerciseItems
      .map((item) => {
        const burned =
          item.estimatedCaloriesBurned === null
            ? 'calories not estimated'
            : `~${item.estimatedCaloriesBurned} kcal burned`;

        return `${item.name} (${item.durationMinutes} min, ${burned})`;
      })
      .join(', ');

    parts.push(`Exercise: ${exerciseSummaries}.`);
  }

  const hasBackDatedItem =
    items.some((item) => item.resolvedDate) ||
    exerciseItems.some((item) => item.resolvedDate);

  if (hasBackDatedItem) {
    parts.push(
      'Items with a stated day (e.g. yesterday) will be logged to that date.',
    );
  }

  return parts.join(' ');
}

/** Builds the raw (pre-normalizeMealEstimate) structured output for a fully resolved multi-item meal (food and/or exercise). */
export function buildCombinedRawEstimate(
  items: MealEstimateItemOutput[],
  dbCount: number,
  aiCount: number,
  confidenceSources: Array<{
    confidenceLevel: MealEstimateStructuredOutput['confidenceLevel'];
    confidenceScore: number;
  }>,
  requestedMealType?: MealType,
  exerciseItems: ExerciseEstimateItemOutput[] = [],
): unknown {
  const totals = calculateItemTotals(items);
  const confidence = combineConfidence(confidenceSources);
  const summaryNames = [
    ...items.map((item) => item.name),
    ...exerciseItems.map((item) => item.name),
  ];

  return {
    intent: 'MEAL_ESTIMATE',
    summary: summaryNames.join(', ') || 'Meal estimate',
    confidenceLevel: confidence.confidenceLevel,
    confidenceScore: confidence.confidenceScore,
    mealType: requestedMealType ?? null,
    items,
    totals,
    clarificationQuestions: [],
    assumptions: [],
    warnings: [],
    reply: buildCombinedReply(items, totals, dbCount, aiCount, exerciseItems),
  };
}

/** Builds the raw (pre-normalizeMealEstimate) structured output for NOT_FOOD/CLARIFICATION_NEEDED passthrough. */
export function buildPassthroughRawEstimate(
  segmentation: NormalizedSegmentation,
  requestedMealType?: MealType,
): unknown {
  return {
    intent: segmentation.intent,
    summary:
      segmentation.intent === 'NOT_FOOD'
        ? 'Meal suggestion'
        : 'Needs clarification',
    confidenceLevel: 'LOW',
    confidenceScore: 0.2,
    mealType: requestedMealType ?? null,
    items: [],
    totals: {
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      fiberGrams: null,
    },
    clarificationQuestions: segmentation.clarificationQuestions,
    assumptions: [],
    warnings: [],
    reply: segmentation.reply,
  };
}

/** Wraps a single AI-estimated item into the shape unknownFoodQueueService.recordSighting() expects. */
export function buildSingleItemEstimate(
  item: MealEstimateItemOutput,
  requestedMealType?: MealType,
): MealEstimateStructuredOutput {
  const totals = calculateItemTotals([item]);

  return {
    intent: 'MEAL_ESTIMATE',
    summary: item.name,
    confidenceLevel: 'MEDIUM',
    confidenceScore: 0.7,
    mealType: requestedMealType ?? null,
    items: [item],
    totals,
    clarificationQuestions: [],
    assumptions: item.assumptions,
    warnings: [],
    reply: `${item.name}, ${item.quantityText}: about ${totals.calories} kcal and ${totals.proteinGrams}g protein.`,
  };
}
