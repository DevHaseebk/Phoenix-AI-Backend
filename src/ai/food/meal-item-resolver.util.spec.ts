import { MealEstimateItemOutput } from '../ai-provider.interface';
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
    expect(result.items[0]).toEqual({
      text: 'boiled eggs',
      quantity: '2',
      unit: 'large egg',
    });
    expect(result.items[2]).toEqual({
      text: 'low fat milk',
      quantity: '200',
      unit: 'g',
    });
  });

  it('never invents a quantity - a segment with no stated amount stays null/null', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [{ text: 'daal', quantity: null, unit: null }],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items[0]).toEqual({
      text: 'daal',
      quantity: null,
      unit: null,
    });
  });

  it('drops malformed entries with no text instead of producing empty segments', () => {
    const result = normalizeSegmentation({
      intent: 'MEAL_ITEMS',
      items: [{ text: '', quantity: '1', unit: 'g' }, { text: 'rice' }],
      clarificationQuestions: [],
      reply: '',
    });

    expect(result.items).toEqual([
      { text: 'rice', quantity: null, unit: null },
    ]);
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
      { text: 'oats', quantity: '100', unit: 'g' },
      { text: 'low fat milk', quantity: null, unit: null },
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
        { text: 'oats', quantity: '100', unit: 'g' },
        { text: 'low fat milk', quantity: '200', unit: 'g' },
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
        { text: 'oats', quantity: '100', unit: 'g' },
        { text: 'low fat milk', quantity: '200', unit: 'g' },
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
