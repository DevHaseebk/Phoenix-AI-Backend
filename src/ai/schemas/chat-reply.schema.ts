import { Type } from '@google/genai';

export const chatReplyResponseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    supportModeTriggered: { type: Type.BOOLEAN },
  },
  required: ['reply', 'supportModeTriggered'],
};
