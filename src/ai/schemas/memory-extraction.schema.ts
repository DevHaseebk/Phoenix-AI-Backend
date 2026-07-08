import { Type } from '@google/genai';

export const memoryCategoryValues = [
  'PERMANENT_PROFILE',
  'FOOD_PREFERENCE',
  'PORTION_PATTERN',
  'BEHAVIORAL_PATTERN',
  'MOTIVATION_STYLE',
  'TEMPORARY_LIFE_EVENT',
  'MILESTONE',
  'EMOTIONAL_SUPPORT_PATTERN',
] as const;

export const memoryExtractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    shouldSave: { type: Type.BOOLEAN },
    category: {
      type: Type.STRING,
      enum: [...memoryCategoryValues],
      nullable: true,
    },
    content: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER, nullable: true },
    isUserVisible: { type: Type.BOOLEAN },
  },
  required: [
    'shouldSave',
    'category',
    'content',
    'confidence',
    'isUserVisible',
  ],
};
