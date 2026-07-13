import {
  AiMealEstimateStatus,
  ConfidenceLevel,
  MealType,
} from '@prisma/client';
import {
  MealEstimateItemOutput,
  MealEstimateStructuredOutput,
} from '../ai-provider.interface';

const mealTypes = new Set<string>(Object.values(MealType));
const confidenceLevels = new Set<string>([
  ConfidenceLevel.LOW,
  ConfidenceLevel.MEDIUM,
  ConfidenceLevel.HIGH,
]);

export interface NormalizedMealEstimate {
  structured: MealEstimateStructuredOutput;
  status: AiMealEstimateStatus;
}

export function normalizeMealEstimate(
  raw: unknown,
  requestedMealType?: MealType,
): NormalizedMealEstimate {
  const source = asRecord(raw);
  const intent = normalizeIntent(source.intent);
  const items = normalizeItems(source.items);
  const totalsFromItems = calculateTotals(items);
  const confidenceScore = clampNumber(source.confidenceScore, 0, 1);
  const confidenceLevel = normalizeConfidenceLevel(source.confidenceLevel);
  const mealType = normalizeMealType(source.mealType, requestedMealType);
  const totals = normalizeTotals(source.totals, totalsFromItems);
  const status =
    intent !== 'MEAL_ESTIMATE' ||
    confidenceScore < 0.5 ||
    confidenceLevel === ConfidenceLevel.LOW
      ? AiMealEstimateStatus.NEEDS_CLARIFICATION
      : AiMealEstimateStatus.DRAFT;

  return {
    status,
    structured: {
      intent,
      summary: normalizeText(source.summary, 'Meal estimate'),
      confidenceLevel,
      confidenceScore,
      mealType,
      items,
      totals,
      clarificationQuestions: normalizeStringArray(
        source.clarificationQuestions,
      ),
      assumptions: normalizeStringArray(source.assumptions),
      warnings: normalizeStringArray(source.warnings),
      reply: normalizeText(
        source.reply,
        'I estimated this meal. Please review before saving it.',
      ),
    },
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeIntent(
  value: unknown,
): MealEstimateStructuredOutput['intent'] {
  return value === 'MEAL_ESTIMATE' ||
    value === 'CLARIFICATION_NEEDED' ||
    value === 'NOT_FOOD'
    ? value
    : 'CLARIFICATION_NEEDED';
}

function normalizeConfidenceLevel(
  value: unknown,
): MealEstimateStructuredOutput['confidenceLevel'] {
  return typeof value === 'string' && confidenceLevels.has(value)
    ? (value as MealEstimateStructuredOutput['confidenceLevel'])
    : ConfidenceLevel.LOW;
}

function normalizeMealType(
  value: unknown,
  requestedMealType?: MealType,
): MealType | null {
  if (typeof value === 'string' && mealTypes.has(value)) {
    return value as MealType;
  }

  return requestedMealType ?? null;
}

function normalizeItems(value: unknown): MealEstimateItemOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 20).map((item) => {
    const source = asRecord(item);

    return {
      name: normalizeText(source.name, 'Food item').slice(0, 150),
      quantityText: normalizeText(
        source.quantityText,
        'estimated portion',
      ).slice(0, 100),
      calories: clampNumber(source.calories, 0, 10000),
      proteinGrams: clampNumber(source.proteinGrams, 0, 500),
      carbsGrams: clampNumber(source.carbsGrams, 0, 1000),
      fatGrams: clampNumber(source.fatGrams, 0, 500),
      fiberGrams:
        source.fiberGrams === null || source.fiberGrams === undefined
          ? null
          : clampNumber(source.fiberGrams, 0, 100),
      assumptions: normalizeStringArray(source.assumptions),
      // Per-item day/meal placement (already validated by
      // normalizeSegmentation before it reaches this shape) - preserved so
      // confirm-time date grouping survives normalization.
      resolvedDate:
        typeof source.resolvedDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(source.resolvedDate)
          ? source.resolvedDate
          : null,
      mealSlot: normalizeMealType(source.mealSlot),
    };
  });
}

function normalizeTotals(
  value: unknown,
  fallback: MealEstimateStructuredOutput['totals'],
): MealEstimateStructuredOutput['totals'] {
  const source = asRecord(value);
  const calories = clampNumber(source.calories, 0, 5000);

  return {
    calories: calories > 0 ? calories : Math.min(fallback.calories, 5000),
    proteinGrams:
      clampNumber(source.proteinGrams, 0, 500) || fallback.proteinGrams,
    carbsGrams: clampNumber(source.carbsGrams, 0, 1000) || fallback.carbsGrams,
    fatGrams: clampNumber(source.fatGrams, 0, 500) || fallback.fatGrams,
    fiberGrams:
      source.fiberGrams === null || source.fiberGrams === undefined
        ? fallback.fiberGrams
        : clampNumber(source.fiberGrams, 0, 100),
  };
}

function calculateTotals(
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

export function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];
}

function clampNumber(value: unknown, min: number, max: number): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.min(Math.max(numeric, min), max);
}
