import { ConfigService } from '@nestjs/config';
import { ExerciseType, MealType } from '@prisma/client';
import type { AiProvider } from '../ai-provider.interface';
import { MealEstimateDto } from '../dto/meal-estimate.dto';
import { RagService } from '../rag/rag.service';
import { FoodMatchingService, FoodMatchResult } from './food-matching.service';
import {
  MealItemResolverService,
  MealResolutionContext,
} from './meal-item-resolver.service';
import { UnknownFoodQueueService } from './unknown-food-queue.service';

function dbMatch(
  overrides: Partial<FoodMatchResult['structured']> & {
    name: string;
    calories: number;
    proteinGrams: number;
    quantityText: string;
  },
  matchTier: 'EXACT' | 'CONTAINMENT' = 'CONTAINMENT',
): FoodMatchResult {
  return {
    foodItemId: `food-${overrides.name}`,
    matchTier,
    structured: {
      intent: 'MEAL_ESTIMATE',
      summary: overrides.name,
      confidenceLevel: 'HIGH',
      confidenceScore: 0.9,
      mealType: null,
      items: [
        {
          name: overrides.name,
          quantityText: overrides.quantityText,
          calories: overrides.calories,
          proteinGrams: overrides.proteinGrams,
          carbsGrams: 0,
          fatGrams: 0,
          fiberGrams: null,
          assumptions: [],
        },
      ],
      totals: {
        calories: overrides.calories,
        proteinGrams: overrides.proteinGrams,
        carbsGrams: 0,
        fatGrams: 0,
        fiberGrams: null,
      },
      clarificationQuestions: [],
      assumptions: [],
      warnings: [],
      reply: `${overrides.name}, ${overrides.quantityText}: about ${overrides.calories} kcal, from our food database.`,
    },
  };
}

describe('MealItemResolverService', () => {
  const resolveMatch = jest.fn();
  const foodMatchingService = {
    resolveMatch,
  } as unknown as FoodMatchingService;
  const recordSighting = jest.fn();
  const unknownFoodQueueService = {
    recordSighting,
  } as unknown as UnknownFoodQueueService;
  const retrieveRelevantChunks = jest.fn();
  const ragService = {
    retrieveRelevantChunks,
  } as unknown as RagService;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        GEMINI_MODEL: 'gemini-2.5-flash',
        AI_TIMEOUT_MS: '30000',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const segmentMealItems = jest.fn();
  const generateMealEstimate = jest.fn();

  function createService(
    providerOverrides: Partial<AiProvider> = {},
  ): MealItemResolverService {
    const provider = {
      generateMealEstimate,
      segmentMealItems,
      ...providerOverrides,
    } as unknown as AiProvider;

    return new MealItemResolverService(
      config,
      provider,
      ragService,
      foodMatchingService,
      unknownFoodQueueService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    retrieveRelevantChunks.mockResolvedValue([]);
    recordSighting.mockResolvedValue(undefined);
  });

  function dto(message: string, mealType?: MealType): MealEstimateDto {
    return { message, mealType };
  }

  function resolutionContext(overrides: Partial<MealResolutionContext> = {}) {
    return {
      userContext: '{}',
      timezone: 'Asia/Karachi',
      todayLocalDate: '2026-07-13',
      currentWeightKg: 88,
      ...overrides,
    };
  }

  /** Raw segmentation item as the provider would return it (pre-normalization). */
  function rawSegment(
    overrides: Partial<{
      itemType: 'FOOD' | 'EXERCISE';
      text: string;
      quantity: string | null;
      unit: string | null;
      mealSlot: string | null;
      durationMinutes: number | null;
      distanceKm: number | null;
      steps: number | null;
      date: string | null;
    }> & { text: string },
  ) {
    return {
      itemType: 'FOOD',
      quantity: null,
      unit: null,
      mealSlot: null,
      durationMinutes: null,
      distanceKm: null,
      steps: null,
      date: null,
      ...overrides,
    };
  }

  it('trusts an EXACT whole-message match and makes zero AI calls', async () => {
    resolveMatch.mockResolvedValueOnce(
      dbMatch(
        {
          name: 'Chicken Biryani',
          calories: 660,
          proteinGrams: 32,
          quantityText: '1 medium plate',
        },
        'EXACT',
      ),
    );

    const service = createService();
    const result = await service.resolveMeal(
      dto('chicken biryani'),
      resolutionContext(),
    );

    expect(segmentMealItems).not.toHaveBeenCalled();
    expect(generateMealEstimate).not.toHaveBeenCalled();
    expect(result.normalized.structured.totals.calories).toBe(660);
    expect(resolveMatch).toHaveBeenCalledTimes(1);
  });

  it('does NOT trust a CONTAINMENT whole-message match - falls through to segmentation instead of silently matching only a fragment', async () => {
    // Reproduces the reported bug's root cause: containment matching "low
    // fat milk" as a substring of the full, multi-food message.
    resolveMatch.mockResolvedValueOnce(
      dbMatch(
        {
          name: 'Milk (skim)',
          calories: 34,
          proteinGrams: 3,
          quantityText: '100g',
        },
        'CONTAINMENT',
      ),
    );
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          { text: 'boiled eggs', quantity: '2', unit: 'large egg' },
          { text: 'oats', quantity: '100', unit: 'g' },
          { text: 'low fat milk', quantity: '200', unit: 'g' },
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 15,
      tokenInput: 100,
      tokenOutput: 40,
    });
    resolveMatch
      .mockResolvedValueOnce(
        dbMatch({
          name: 'Boiled Egg',
          calories: 155,
          proteinGrams: 13,
          quantityText: '2 x 1 large egg',
        }),
      )
      .mockResolvedValueOnce(
        dbMatch({
          name: 'Oats',
          calories: 389,
          proteinGrams: 17,
          quantityText: '100g',
        }),
      )
      .mockResolvedValueOnce(
        dbMatch({
          name: 'Low Fat Milk',
          calories: 68,
          proteinGrams: 7,
          quantityText: '200g',
        }),
      );

    const service = createService();
    const result = await service.resolveMeal(
      dto(
        'in breakfast i eat 2 boiled egg 100gm oats and 200gm low fat milk',
        MealType.BREAKFAST,
      ),
      resolutionContext(),
    );

    // All 3 foods appear - none silently dropped like the original bug.
    const names = result.normalized.structured.items.map((item) => item.name);
    expect(names).toEqual(['Boiled Egg', 'Oats', 'Low Fat Milk']);
    // 155 + 389 + 68 = 612, not the old buggy 34.
    expect(result.normalized.structured.totals.calories).toBe(612);
    expect(generateMealEstimate).not.toHaveBeenCalled();
    expect(result.normalized.structured.reply).toContain(
      'All items matched from our food database.',
    );
  });

  it('scales each segment by its OWN stated quantity, not a shared default', async () => {
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          { text: 'boiled eggs', quantity: '2', unit: 'large egg' },
          { text: 'low fat milk', quantity: '200', unit: 'g' },
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });
    resolveMatch
      .mockResolvedValueOnce(null) // whole-message fast path misses
      .mockImplementationOnce(
        (
          text: string,
          _mealType: unknown,
          portion: { quantity: string; unit: string },
        ) =>
          Promise.resolve(
            dbMatch({
              name: 'Boiled Egg',
              calories: portion.quantity === '2' ? 155 : 78,
              proteinGrams: 13,
              quantityText: `${portion.quantity} x 1 large egg`,
            }),
          ),
      )
      .mockImplementationOnce(
        (
          text: string,
          _mealType: unknown,
          portion: { quantity: string; unit: string },
        ) =>
          Promise.resolve(
            dbMatch({
              name: 'Low Fat Milk',
              calories: Number(portion.quantity) === 200 ? 68 : 34,
              proteinGrams: 7,
              quantityText: `${portion.quantity}g`,
            }),
          ),
      );

    const service = createService();
    const result = await service.resolveMeal(
      dto('2 boiled eggs and 200gm low fat milk'),
      resolutionContext(),
    );

    expect(resolveMatch).toHaveBeenNthCalledWith(2, 'boiled eggs', undefined, {
      quantity: '2',
      unit: 'large egg',
    });
    expect(resolveMatch).toHaveBeenNthCalledWith(3, 'low fat milk', undefined, {
      quantity: '200',
      unit: 'g',
    });
    expect(result.normalized.structured.totals.calories).toBe(155 + 68);
  });

  it('batches every DB-unmatched item into a single AI call and queues each miss individually', async () => {
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          { text: 'boiled eggs', quantity: '2', unit: 'large egg' },
          { text: 'some obscure snack', quantity: null, unit: null },
          { text: 'another unknown food', quantity: null, unit: null },
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });
    resolveMatch
      .mockResolvedValueOnce(null) // whole-message fast path misses
      .mockResolvedValueOnce(
        dbMatch({
          name: 'Boiled Egg',
          calories: 155,
          proteinGrams: 13,
          quantityText: '2 x 1 large egg',
        }),
      )
      .mockResolvedValueOnce(null) // "some obscure snack" - no DB match
      .mockResolvedValueOnce(null); // "another unknown food" - no DB match
    generateMealEstimate.mockResolvedValue({
      structured: {
        intent: 'MEAL_ESTIMATE',
        summary: '',
        confidenceLevel: 'MEDIUM',
        confidenceScore: 0.6,
        mealType: null,
        items: [
          {
            name: 'Some Obscure Snack',
            quantityText: '1 serving',
            calories: 200,
            proteinGrams: 4,
            carbsGrams: 20,
            fatGrams: 8,
            fiberGrams: null,
            assumptions: [],
          },
          {
            name: 'Another Unknown Food',
            quantityText: '1 serving',
            calories: 150,
            proteinGrams: 3,
            carbsGrams: 15,
            fatGrams: 5,
            fiberGrams: null,
            assumptions: [],
          },
        ],
        totals: {
          calories: 350,
          proteinGrams: 7,
          carbsGrams: 35,
          fatGrams: 13,
          fiberGrams: null,
        },
        clarificationQuestions: [],
        assumptions: [],
        warnings: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 25,
    });

    const service = createService();
    const result = await service.resolveMeal(
      dto('2 boiled eggs, some obscure snack and another unknown food'),
      resolutionContext(),
    );

    // Exactly ONE batched call for both misses, never one call per miss.
    expect(generateMealEstimate).toHaveBeenCalledTimes(1);
    expect(recordSighting).toHaveBeenCalledTimes(2);
    expect(recordSighting).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedText: 'some obscure snack' }),
    );
    expect(recordSighting).toHaveBeenCalledWith(
      expect.objectContaining({ normalizedText: 'another unknown food' }),
    );
    expect(result.normalized.structured.totals.calories).toBe(155 + 350);
    expect(result.normalized.structured.reply).toContain(
      '1 item matched from our food database, 2 estimated by AI.',
    );
  });

  it('passes through NOT_FOOD suggestions from segmentation without a second AI call', async () => {
    resolveMatch.mockResolvedValueOnce(null);
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'NOT_FOOD',
        items: [],
        clarificationQuestions: [],
        reply: 'Try grilled chicken with sabzi, or daal with 2 roti.',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 12,
    });

    const service = createService();
    const result = await service.resolveMeal(
      dto('what should I eat for lunch?'),
      resolutionContext(),
    );

    expect(generateMealEstimate).not.toHaveBeenCalled();
    expect(result.normalized.structured.intent).toBe('NOT_FOOD');
    expect(result.normalized.structured.reply).toContain('grilled chicken');
  });

  it('falls back to the legacy single-call whole-message path when the provider has no segmentMealItems (e.g. LocalAiProvider)', async () => {
    resolveMatch.mockResolvedValueOnce(null);
    generateMealEstimate.mockResolvedValue({
      structured: {
        intent: 'MEAL_ESTIMATE',
        summary: 'Estimate',
        confidenceLevel: 'LOW',
        confidenceScore: 0.2,
        mealType: null,
        items: [],
        totals: {
          calories: 0,
          proteinGrams: 0,
          carbsGrams: 0,
          fatGrams: 0,
          fiberGrams: null,
        },
        clarificationQuestions: [
          'Please add food names and approximate portions.',
        ],
        assumptions: [],
        warnings: [],
        reply: '[Local AI fallback]',
      },
      model: 'local',
      latencyMs: 0,
    });

    const service = createService({ segmentMealItems: undefined });
    const result = await service.resolveMeal(
      dto('something vague'),
      resolutionContext(),
    );

    expect(segmentMealItems).not.toHaveBeenCalled();
    expect(generateMealEstimate).toHaveBeenCalledTimes(1);
    expect(result.normalized.structured.reply).toBe('[Local AI fallback]');
  });

  it('injects the real local date context into the segmentation prompt so relative dates resolve correctly', async () => {
    resolveMatch.mockResolvedValueOnce(null);
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'NOT_FOOD',
        items: [],
        clarificationQuestions: [],
        reply: 'Suggestion.',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 5,
    });

    const service = createService();
    await service.resolveMeal(dto('anything'), resolutionContext());

    const request = (
      segmentMealItems.mock.calls[0] as [{ userPrompt: string }]
    )[0];
    expect(request.userPrompt).toContain(
      "today's local date is 2026-07-13 (timezone Asia/Karachi)",
    );
    expect(request.userPrompt).toContain('Yesterday was 2026-07-12.');
    expect(request.userPrompt).toContain(
      'The day before yesterday was 2026-07-11.',
    );
  });

  it('extracts exercise alongside food with per-item dates, computing exercise calories deterministically (no extra AI call)', async () => {
    resolveMatch.mockResolvedValueOnce(null); // whole-message fast path misses
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          rawSegment({
            text: 'boiled eggs',
            quantity: '2',
            unit: 'large egg',
            mealSlot: 'BREAKFAST',
            date: '2026-07-12',
          }),
          rawSegment({
            itemType: 'EXERCISE',
            text: 'walk',
            durationMinutes: 30,
            date: '2026-07-12',
          }),
          rawSegment({
            itemType: 'EXERCISE',
            text: 'walk',
            durationMinutes: 45,
            date: '2026-07-12',
          }),
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });
    resolveMatch.mockResolvedValueOnce(
      dbMatch({
        name: 'Boiled Egg',
        calories: 155,
        proteinGrams: 13,
        quantityText: '2 x 1 large egg',
      }),
    );

    const service = createService();
    const result = await service.resolveMeal(
      dto(
        'last day breakfast 2 boiled eggs, aur 30 min walk ki, then 45 min walk',
      ),
      resolutionContext({ currentWeightKg: 88 }),
    );

    // Exercise never spends an AI call - only the one segmentation call ran.
    expect(generateMealEstimate).not.toHaveBeenCalled();
    expect(result.exerciseItems).toHaveLength(2);
    // MET formula reused exactly: 3.5 MET x 88kg x 0.5h = 154 kcal.
    expect(result.exerciseItems[0]).toMatchObject({
      exerciseType: ExerciseType.WALKING,
      durationMinutes: 30,
      estimatedCaloriesBurned: 154,
      resolvedDate: '2026-07-12',
    });
    expect(result.exerciseItems[1].durationMinutes).toBe(45);
    // Food item carries its own resolved date + meal slot.
    expect(result.normalized.structured.items[0]).toMatchObject({
      name: 'Boiled Egg',
      resolvedDate: '2026-07-12',
      mealSlot: MealType.BREAKFAST,
    });
    // The reply acknowledges the exercise and the back-dating.
    expect(result.normalized.structured.reply).toContain('Exercise:');
    expect(result.normalized.structured.reply).toContain(
      'will be logged to that date',
    );
  });

  it('produces a confirmable estimate for an exercise-only message (no food items)', async () => {
    resolveMatch.mockResolvedValueOnce(null);
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          rawSegment({
            itemType: 'EXERCISE',
            text: 'walk',
            steps: 5000,
            date: null,
          }),
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });

    const service = createService();
    const result = await service.resolveMeal(
      dto('aaj 5000 steps walk ki'),
      resolutionContext(),
    );

    expect(result.exerciseItems).toHaveLength(1);
    // Duration derived from steps at ~100 steps/min, disclosed as assumption.
    expect(result.exerciseItems[0].durationMinutes).toBe(50);
    expect(result.exerciseItems[0].assumptions[0]).toMatch(/steps/i);
    // Exercise-only estimates are still confirmable (DRAFT, not
    // NEEDS_CLARIFICATION) despite zero food items.
    expect(result.normalized.status).toBe('DRAFT');
    expect(result.normalized.structured.items).toEqual([]);
    expect(result.normalized.structured.totals.calories).toBe(0);
  });

  it('drops future/too-old resolved dates to null (today) instead of trusting a model error', async () => {
    resolveMatch.mockResolvedValueOnce(null);
    segmentMealItems.mockResolvedValue({
      structured: {
        intent: 'MEAL_ITEMS',
        items: [
          rawSegment({
            itemType: 'EXERCISE',
            text: 'walk',
            durationMinutes: 30,
            date: '2026-07-14', // future relative to todayLocalDate
          }),
          rawSegment({
            itemType: 'EXERCISE',
            text: 'jog',
            durationMinutes: 20,
            date: '2026-06-01', // far older than the 7-day sanity window
          }),
        ],
        clarificationQuestions: [],
        reply: '',
      },
      model: 'gemini-2.5-flash',
      latencyMs: 10,
    });

    const service = createService();
    const result = await service.resolveMeal(
      dto('walk aur jog'),
      resolutionContext({ todayLocalDate: '2026-07-13' }),
    );

    expect(result.exerciseItems[0].resolvedDate).toBeNull();
    expect(result.exerciseItems[1].resolvedDate).toBeNull();
  });
});
