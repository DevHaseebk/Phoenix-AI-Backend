import { Type } from '@google/genai';

export const mealEstimateResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ['MEAL_ESTIMATE', 'CLARIFICATION_NEEDED', 'NOT_FOOD'],
    },
    summary: { type: Type.STRING },
    confidenceLevel: {
      type: Type.STRING,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    confidenceScore: { type: Type.NUMBER },
    mealType: {
      type: Type.STRING,
      enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'CUSTOM'],
      nullable: true,
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantityText: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          proteinGrams: { type: Type.NUMBER },
          carbsGrams: { type: Type.NUMBER },
          fatGrams: { type: Type.NUMBER },
          fiberGrams: { type: Type.NUMBER, nullable: true },
          assumptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          'name',
          'quantityText',
          'calories',
          'proteinGrams',
          'carbsGrams',
          'fatGrams',
          'fiberGrams',
          'assumptions',
        ],
      },
    },
    totals: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.NUMBER },
        proteinGrams: { type: Type.NUMBER },
        carbsGrams: { type: Type.NUMBER },
        fatGrams: { type: Type.NUMBER },
        fiberGrams: { type: Type.NUMBER, nullable: true },
      },
      required: [
        'calories',
        'proteinGrams',
        'carbsGrams',
        'fatGrams',
        'fiberGrams',
      ],
    },
    clarificationQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    assumptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    reply: { type: Type.STRING },
  },
  required: [
    'intent',
    'summary',
    'confidenceLevel',
    'confidenceScore',
    'mealType',
    'items',
    'totals',
    'clarificationQuestions',
    'assumptions',
    'warnings',
    'reply',
  ],
};
