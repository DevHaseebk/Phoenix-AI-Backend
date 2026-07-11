import { Type } from '@google/genai';

// Used only by AiProvider.segmentMealItems() - splits a raw meal message
// into distinct food items before Food Database matching. See
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
          text: { type: Type.STRING },
          quantity: { type: Type.STRING, nullable: true },
          unit: { type: Type.STRING, nullable: true },
        },
        required: ['text', 'quantity', 'unit'],
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
