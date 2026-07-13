import {
  ExerciseEstimateItemOutput,
  MealEstimateItemOutput,
  MealItemSegment,
} from '../ai-provider.interface';
import {
  buildCombinedRawEstimate,
  buildCombinedReply,
  buildMissingItemsPrompt,
  buildPassthroughRawEstimate,
  buildSingleItemEstimate,
  calculateItemTotals,
  combineConfidence,
  mapBatchEstimateToItems,
  normalizeSegmentation,
} from './meal-item-resolver.util';

function item(
  overrides: Partial<MealEstimateItemOutput> & { name: string },
): MealEstimateItemOutput {
  return {
    quantityText: '1 serving',
    calories: 100,
    proteinGrams: 5,
    carbsGrams: 10,
    fatGrams: 2,
    fiberGrams: null,
    assumptions: [],
    ...overrides,
  };
}

function segment(
  overrides: Partial<MealItemSegment> & { text: string },
): MealItemSegment {
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

describe('normalizeSegmentation', () => {
  it('parses a well-formed MEAL_ITEMS response, preserving stated quantity/unit per item', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [
        { text: 'boiled eggs', quantity: '2', unit: 'large egg' },
        { text: 'oats', quantity: '100', unit: 'g' },
        { text: 'low fat milk', quantity: '200', unit: 'g' },
      ],
      clarificationQuestions: [],
      reply: 'Got it.',
    });

    expect(result.intent).toBe('MEAL_ITEMS');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual(
      segment({ text: 'boiled eggs', quantity: '2', unit: 'large egg' }),
    );
    expect(result.items[2]).toEqual(
      segment({ text: 'low fat milk', quantity: '200', unit: 'g' }),
    );
  });

  it('never invents a quantity - a segment with no stated amount stays null/null', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [{ text: 'daal', quantity: null, unit: null }],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items[0]).toEqual(segment({ text: 'daal' }));
  });

  it('drops malformed entries with no text instead of producing empty segments', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [{ text: '', quantity: '1', unit: 'g' }, { text: 'rice' }],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items).toEqual([segment({ text: 'rice' })]);
  });

  it('defaults a missing/unknown itemType to FOOD so pre-exercise providers keep the old behavior', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [
        { text: 'oats' },
        { text: 'walk', itemType: 'EXERCISE', durationMinutes: 30 },
        { text: 'mystery', itemType: 'SOMETHING_ELSE' },
      ],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items.map((entry) => entry.itemType)).toEqual([
      'FOOD',
      'EXERCISE',
      'FOOD',
    ]);
    expect(result.items[1].durationMinutes).toBe(30);
  });

  it('keeps exercise numbers only when plausible (duration/steps/distance ranges)', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [
        {
          text: 'walk',
          itemType: 'EXERCISE',
          durationMinutes: 0, // below minimum -> null
          steps: 5000.4, // rounded to integer
          distanceKm: 3.2,
        },
        {
          text: 'mega walk',
          itemType: 'EXERCISE',
          durationMinutes: 5000, // above 24h -> null
          steps: -10, // -> null
          distanceKm: 9000, // -> null
        },
      ],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items[0]).toMatchObject({
      durationMinutes: null,
      steps: 5000,
      distanceKm: 3.2,
    });
    expect(result.items[1]).toMatchObject({
      durationMinutes: null,
      steps: null,
      distanceKm: null,
    });
  });

  describe('per-item date resolution', () => {
    const today = '2026-07-13';

    function normalizeDates(dates: unknown[]): (string | null)[] {
      const result = normalizeSegmentation(
        {
          intent: 'MEAL_ITEMS',
          items: dates.map((date, index) => ({
            text: `food ${index}`,
            date,
          })),
          clarificationQuestions: [],
          reply: '',
        },
        today,
      );

      return result.items.map((entry) => entry.date);
    }

    it('keeps valid dates within the last week (today, yesterday, parso)', () => {
      expect(
        normalizeDates(['2026-07-13', '2026-07-12', '2026-07-11']),
      ).toEqual(['2026-07-13', '2026-07-12', '2026-07-11']);
    });

    it('drops unspecified, malformed, and impossible dates to null (= today default)', () => {
      expect(
        normalizeDates([
          null,
          undefined,
          'yesterday',
          '2026-7-1',
          '2026-02-30',
        ]),
      ).toEqual([null, null, null, null, null]);
    });

    it('drops future dates - a loggable item can never be tomorrow', () => {
      expect(normalizeDates(['2026-07-14', '2027-01-01'])).toEqual([
        null,
        null,
      ]);
    });

    it('drops dates older than the 7-day sanity window (bulk backfill is out of scope)', () => {
      expect(
        normalizeDates(['2026-07-06', '2026-07-05', '2026-06-01']),
      ).toEqual(['2026-07-06', null, null]);
    });

    it('keeps week-old dates when no today reference is provided (format-only validation)', () => {
      const result = normalizeSegmentation({
        intent: 'MEAL_ITEMS',
        items: [{ text: 'food', date: '2026-06-01' }],
        clarificationQuestions: [],
        reply: '',
      });

      expect(result.items[0].date).toBe('2026-06-01');
    });
  });

  it('falls back to CLARIFICATION_NEEDED for a malformed/unknown intent', () => {
    const result = normalizeSegmentation({ intent: 'NONSENSE' });
    expect(result.intent).toBe('CLARIFICATION_NEEDED');
  });

  it('passes through a NOT_FOOD reply for the suggestion path', () => {
    const result = normalizeSegmentation({
      intent: 'NOT_FOOD',
      items: [],
      clarificationQuestions: [],
      reply: 'Try grilled chicken with sabzi.',
    });

    expect(result.intent).toBe('NOT_FOOD');
    expect(result.reply).toBe('Try grilled chicken with sabzi.');
  });
});

describe('buildMissingItemsPrompt', () => {
  it('numbers each food and includes its stated quantity when known', () => {
    const prompt = buildMissingItemsPrompt([
      segment({ text: 'oats', quantity: '100', unit: 'g' }),
      segment({ text: 'low fat milk' }),
    ]);

    expect(prompt).toContain('1. oats (stated quantity: 100 g)');
    expect(prompt).toContain(
      '2. low fat milk (no quantity stated - use a realistic default serving)',
    );
  });
});

describe('mapBatchEstimateToItems', () => {
  it('maps items back to their originating segments by array position', () => {
    const mapped = mapBatchEstimateToItems(
      {
        intent: 'MEAL_ESTIMATE',
        summary: '',
        confidenceLevel: 'MEDIUM',
        confidenceScore: 0.7,
        mealType: null,
        items: [item({ name: 'Oats' }), item({ name: 'Low Fat Milk' })],
        totals: {
          calories: 200,
          proteinGrams: 10,
          carbsGrams: 20,
          fatGrams: 4,
          fiberGrams: null,
        },
        clarificationQuestions: [],
        assumptions: [],
        warnings: [],
        reply: '',
      },
      [
        segment({ text: 'oats', quantity: '100', unit: 'g' }),
        segment({ text: 'low fat milk', quantity: '200', unit: 'g' }),
      ],
    );

    expect(mapped).toHaveLength(2);
    expect(mapped[0].name).toBe('Oats');
    expect(mapped[1].name).toBe('Low Fat Milk');
  });

  it('degrades gracefully to a labeled placeholder when the provider returns fewer items than requested', () => {
    const mapped = mapBatchEstimateToItems(
      {
        intent: 'MEAL_ESTIMATE',
        summary: '',
        confidenceLevel: 'MEDIUM',
        confidenceScore: 0.7,
        mealType: null,
        items: [item({ name: 'Oats' })],
        totals: {
          calories: 100,
          proteinGrams: 5,
          carbsGrams: 10,
          fatGrams: 2,
          fiberGrams: null,
        },
        clarificationQuestions: [],
        assumptions: [],
        warnings: [],
        reply: '',
      },
      [
        segment({ text: 'oats', quantity: '100', unit: 'g' }),
        segment({ text: 'low fat milk', quantity: '200', unit: 'g' }),
      ],
    );

    expect(mapped[1].name).toBe('low fat milk');
    expect(mapped[1].calories).toBe(0);
    expect(mapped[1].assumptions[0]).toMatch(/unavailable/i);
  });
});

describe('calculateItemTotals', () => {
  it('sums calories/protein/carbs/fat across all items, correctly combining DB + AI sourced items', () => {
    const totals = calculateItemTotals([
      item({
        name: 'Boiled Egg',
        calories: 155,
        proteinGrams: 13,
        carbsGrams: 1,
        fatGrams: 11,
      }),
      item({
        name: 'Oats',
        calories: 389,
        proteinGrams: 17,
        carbsGrams: 66,
        fatGrams: 7,
      }),
      item({
        name: 'Low Fat Milk',
        calories: 68,
        proteinGrams: 7,
        carbsGrams: 10,
        fatGrams: 0,
      }),
    ]);

    expect(totals.calories).toBe(155 + 389 + 68);
    expect(totals.proteinGrams).toBe(13 + 17 + 7);
  });
});

describe('combineConfidence', () => {
  it('takes the weakest confidence level across all sources (never overclaims certainty)', () => {
    const combined = combineConfidence([
      { confidenceLevel: 'HIGH', confidenceScore: 0.95 },
      { confidenceLevel: 'LOW', confidenceScore: 0.3 },
    ]);

    expect(combined.confidenceLevel).toBe('LOW');
  });

  it('defaults to LOW when there are no contributing sources', () => {
    expect(combineConfidence([]).confidenceLevel).toBe('LOW');
  });
});

describe('buildCombinedReply', () => {
  const items = [item({ name: 'Boiled Egg' }), item({ name: 'Oats' })];
  const totals = {
    calories: 300,
    proteinGrams: 20,
    carbsGrams: 30,
    fatGrams: 10,
    fiberGrams: null,
  };

  it('never claims full DB-sourcing for a mixed-source meal', () => {
    const reply = buildCombinedReply(items, totals, 1, 1);
    expect(reply).not.toContain('All items matched from our food database.');
    expect(reply).toContain(
      '1 item matched from our food database, 1 estimated by AI.',
    );
  });

  it('claims full DB-sourcing only when every item is DB-matched', () => {
    const reply = buildCombinedReply(items, totals, 2, 0);
    expect(reply).toContain('All items matched from our food database.');
  });

  it('never claims any DB-sourcing when every item is AI-estimated', () => {
    const reply = buildCombinedReply(items, totals, 0, 2);
    expect(reply).toContain("aren't in our food database yet");
    expect(reply).not.toContain('food database.');
  });

  const exerciseItem: ExerciseEstimateItemOutput = {
    name: 'walk',
    exerciseType: 'WALKING',
    durationMinutes: 30,
    distanceKm: null,
    steps: null,
    estimatedCaloriesBurned: 154,
    resolvedDate: '2026-07-12',
    assumptions: [],
  };

  it('acknowledges exercise items and back-dated items instead of dropping them silently', () => {
    const reply = buildCombinedReply(items, totals, 2, 0, [exerciseItem]);

    expect(reply).toContain('Exercise: walk (30 min, ~154 kcal burned).');
    expect(reply).toContain('will be logged to that date');
  });

  it('builds an exercise-only reply with no bogus "0 kcal meal" sentence', () => {
    const reply = buildCombinedReply(
      [],
      { ...totals, calories: 0, proteinGrams: 0 },
      0,
      0,
      [exerciseItem],
    );

    expect(reply).not.toContain('about 0 kcal');
    expect(reply).toContain('Exercise: walk');
  });

  it('says so plainly when exercise calories could not be estimated', () => {
    const reply = buildCombinedReply([], totals, 0, 0, [
      { ...exerciseItem, estimatedCaloriesBurned: null, resolvedDate: null },
    ]);

    expect(reply).toContain('calories not estimated');
    expect(reply).not.toContain('will be logged to that date');
  });
});

describe('buildCombinedRawEstimate / buildPassthroughRawEstimate / buildSingleItemEstimate', () => {
  it('builds a MEAL_ESTIMATE raw payload carrying every resolved item and the summed totals', () => {
    const raw = buildCombinedRawEstimate(
      [
        item({ name: 'Boiled Egg', calories: 155 }),
        item({ name: 'Oats', calories: 389 }),
      ],
      1,
      1,
      [
        { confidenceLevel: 'HIGH', confidenceScore: 0.9 },
        { confidenceLevel: 'MEDIUM', confidenceScore: 0.7 },
      ],
      undefined,
    ) as { intent: string; items: unknown[]; totals: { calories: number } };

    expect(raw.intent).toBe('MEAL_ESTIMATE');
    expect(raw.items).toHaveLength(2);
    expect(raw.totals.calories).toBe(544);
  });

  it('builds a NOT_FOOD passthrough payload with zero items/totals and the segmentation reply intact', () => {
    const raw = buildPassthroughRawEstimate(
      {
        intent: 'NOT_FOOD',
        items: [],
        clarificationQuestions: [],
        reply: 'Try grilled chicken with sabzi.',
      },
      undefined,
    ) as { intent: string; items: unknown[]; reply: string };

    expect(raw.intent).toBe('NOT_FOOD');
    expect(raw.items).toEqual([]);
    expect(raw.reply).toBe('Try grilled chicken with sabzi.');
  });

  it('wraps a single AI-estimated item for the unknown food queue', () => {
    const structured = buildSingleItemEstimate(
      item({ name: 'Low Fat Milk', calories: 68, quantityText: '200g' }),
      undefined,
    );

    expect(structured.items).toHaveLength(1);
    expect(structured.summary).toBe('Low Fat Milk');
    expect(structured.totals.calories).toBe(68);
  });
});
