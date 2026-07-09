import { MealType } from '@prisma/client';
import {
  AiProvider,
  AiProviderCoachReplyResponse,
  AiProviderMealEstimateResponse,
  AiProviderRequest,
  MealEstimateStructuredOutput,
} from '../ai-provider.interface';

export class LocalAiProvider implements AiProvider {
  generateCoachReply(
    request: AiProviderRequest,
  ): Promise<AiProviderCoachReplyResponse> {
    return Promise.resolve({
      content:
        '[Local AI fallback] Gemini is not configured for this environment. Log one meal, drink water, and keep the next step small.',
      supportModeTriggered: false,
      model: request.model,
      latencyMs: 0,
    });
  }

  generateMealEstimate(
    request: AiProviderRequest,
  ): Promise<AiProviderMealEstimateResponse> {
    const structured: MealEstimateStructuredOutput = {
      intent: 'CLARIFICATION_NEEDED',
      summary: 'Local fallback cannot estimate nutrition accurately.',
      confidenceLevel: 'LOW',
      confidenceScore: 0.2,
      mealType: inferMealType(request.userPrompt),
      items: [],
      totals: {
        calories: 0,
        proteinGrams: 0,
        carbsGrams: 0,
        fatGrams: 0,
        fiberGrams: null,
      },
      clarificationQuestions: [
        'Please add food names and approximate portions before saving.',
      ],
      assumptions: ['Gemini is not configured in this local environment.'],
      warnings: [
        'This is a local-development fallback, not a real AI estimate.',
      ],
      reply:
        '[Local AI fallback] I need food names and portions before estimating this meal.',
    };

    return Promise.resolve({
      content: JSON.stringify(structured),
      structured,
      model: request.model,
      latencyMs: 0,
    });
  }
}

function inferMealType(message: string): MealType | null {
  const lower = message.toLowerCase();

  if (lower.includes('breakfast')) return MealType.BREAKFAST;
  if (lower.includes('lunch')) return MealType.LUNCH;
  if (lower.includes('dinner')) return MealType.DINNER;
  if (lower.includes('snack')) return MealType.SNACK;

  return null;
}
