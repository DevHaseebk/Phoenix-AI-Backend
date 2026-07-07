import {
  AiMealEstimateStatus,
  ConfidenceLevel,
  MealType,
} from '@prisma/client';
import { normalizeMealEstimate } from './nutrition-sanity.util';

describe('normalizeMealEstimate', () => {
  it('normalizes valid structured meal output', () => {
    const result = normalizeMealEstimate(
      {
        intent: 'MEAL_ESTIMATE',
        summary: 'Chicken biryani estimate',
        confidenceLevel: 'HIGH',
        confidenceScore: 0.8,
        mealType: 'LUNCH',
        items: [
          {
            name: 'Chicken Biryani',
            quantityText: 'medium plate',
            calories: 750,
            proteinGrams: 35,
            carbsGrams: 85,
            fatGrams: 28,
            fiberGrams: 4,
            assumptions: ['medium plate'],
          },
        ],
        totals: {
          calories: 750,
          proteinGrams: 35,
          carbsGrams: 85,
          fatGrams: 28,
          fiberGrams: 4,
        },
        clarificationQuestions: [],
        assumptions: [],
        warnings: [],
        reply: 'Review before saving.',
      },
      MealType.LUNCH,
    );

    expect(result.status).toBe(AiMealEstimateStatus.DRAFT);
    expect(result.structured.mealType).toBe(MealType.LUNCH);
    expect(result.structured.confidenceLevel).toBe(ConfidenceLevel.HIGH);
    expect(result.structured.items[0].calories).toBe(750);
  });

  it('marks low confidence or unclear output as needing clarification', () => {
    const result = normalizeMealEstimate({
      intent: 'CLARIFICATION_NEEDED',
      confidenceLevel: 'LOW',
      confidenceScore: 0.2,
      items: [],
      totals: {},
    });

    expect(result.status).toBe(AiMealEstimateStatus.NEEDS_CLARIFICATION);
    expect(result.structured.confidenceLevel).toBe(ConfidenceLevel.LOW);
    expect(result.structured.items).toEqual([]);
  });

  it('clamps impossible nutrition values to MVP-safe bounds', () => {
    const result = normalizeMealEstimate({
      intent: 'MEAL_ESTIMATE',
      confidenceLevel: 'HIGH',
      confidenceScore: 2,
      items: [
        {
          name: 'Huge meal',
          quantityText: 'massive',
          calories: 50000,
          proteinGrams: 999,
          carbsGrams: 9999,
          fatGrams: 9999,
          fiberGrams: 999,
          assumptions: [],
        },
      ],
      totals: {
        calories: 50000,
        proteinGrams: 999,
        carbsGrams: 9999,
        fatGrams: 9999,
        fiberGrams: 999,
      },
    });

    expect(result.structured.confidenceScore).toBe(1);
    expect(result.structured.items[0].calories).toBe(10000);
    expect(result.structured.totals.calories).toBe(5000);
    expect(result.structured.totals.proteinGrams).toBe(500);
  });
});
