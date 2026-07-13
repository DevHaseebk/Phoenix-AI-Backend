import { Type } from '@google/genai';

// Used only by AiProvider.segmentMealItems() - unified day-activity
// segmentation: splits a raw message into distinct FOOD and EXERCISE items
// (with per-item absolute dates resolved from relative phrasing) before Food
// Database matching / deterministic exercise-calorie estimation. See
// meal-item-resolver.service.ts.
export const mealSegmentationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ['MEAL_ITEMS', 'NOT_FOOD', 'CLARIFICATION_NEEDED'],
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemType: {
            type: Type.STRING,
            enum: ['FOOD', 'EXERCISE'],
          },
          text: { type: Type.STRING },
          quantity: { type: Type.STRING, nullable: true },
          unit: { type: Type.STRING, nullable: true },
          mealSlot: {
            type: Type.STRING,
            enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'],
            nullable: true,
          },
          durationMinutes: { type: Type.NUMBER, nullable: true },
          distanceKm: { type: Type.NUMBER, nullable: true },
          steps: { type: Type.NUMBER, nullable: true },
          date: { type: Type.STRING, nullable: true },
        },
        required: [
          'itemType',
          'text',
          'quantity',
          'unit',
          'mealSlot',
          'durationMinutes',
          'distanceKm',
          'steps',
          'date',
        ],
      },
    },
    clarificationQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    reply: { type: Type.STRING },
  },
  required: ['intent', 'items', 'clarificationQuestions', 'reply'],
};
