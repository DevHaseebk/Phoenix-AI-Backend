import { Type } from '@google/genai';

export const weeklyReviewResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    whatWorked: { type: Type.STRING },
    whatGotDifficult: { type: Type.STRING },
    nextWeekFocus: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['summary', 'whatWorked', 'whatGotDifficult', 'nextWeekFocus'],
};
