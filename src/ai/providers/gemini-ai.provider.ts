import { ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiProvider,
  AiProviderMealEstimateResponse,
  AiProviderRequest,
  AiProviderTextResponse,
  MealEstimateStructuredOutput,
} from '../ai-provider.interface';
import { mealEstimateResponseSchema } from '../schemas/meal-estimate.schema';

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  responseTokenCount?: number;
}

interface GeminiResponseLike {
  text?: string;
  usageMetadata?: GeminiUsageMetadata;
}

export class GeminiAiProvider implements AiProvider {
  private readonly client: GoogleGenAI;

  constructor(private readonly apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateCoachReply(
    request: AiProviderRequest,
  ): Promise<AiProviderTextResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\nUser:\n${request.userPrompt}`,
      }),
      request.timeoutMs,
    );
    const response = toGeminiResponse(rawResponse);
    const content = response.text?.trim();

    if (!content) {
      throw new ServiceUnavailableException('AI response was empty');
    }

    return {
      content,
      model: request.model,
      latencyMs: Date.now() - startedAt,
      tokenInput: response.usageMetadata?.promptTokenCount,
      tokenOutput: response.usageMetadata?.responseTokenCount,
    };
  }

  async generateMealEstimate(
    request: AiProviderRequest,
  ): Promise<AiProviderMealEstimateResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\nMeal text:\n${request.userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: mealEstimateResponseSchema,
        },
      }),
      request.timeoutMs,
    );
    const response = toGeminiResponse(rawResponse);
    const content = response.text?.trim();

    if (!content) {
      throw new ServiceUnavailableException('AI response was empty');
    }

    return {
      content,
      structured: this.parseJson(content),
      model: request.model,
      latencyMs: Date.now() - startedAt,
      tokenInput: response.usageMetadata?.promptTokenCount,
      tokenOutput: response.usageMetadata?.responseTokenCount,
    };
  }

  private parseJson(content: string): MealEstimateStructuredOutput {
    try {
      return JSON.parse(content) as MealEstimateStructuredOutput;
    } catch {
      throw new ServiceUnavailableException(
        'AI returned invalid structured data',
      );
    }
  }

  private async withTimeout<TResponse>(
    promise: Promise<TResponse>,
    timeoutMs: number,
  ): Promise<TResponse> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new ServiceUnavailableException('AI provider timed out')),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'AI provider is temporarily unavailable',
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

function toGeminiResponse(value: unknown): GeminiResponseLike {
  if (value === null || typeof value !== 'object') {
    return {};
  }

  const source = value as {
    text?: unknown;
    usageMetadata?: {
      promptTokenCount?: unknown;
      responseTokenCount?: unknown;
    };
  };

  return {
    text: typeof source.text === 'string' ? source.text : undefined,
    usageMetadata: {
      promptTokenCount:
        typeof source.usageMetadata?.promptTokenCount === 'number'
          ? source.usageMetadata.promptTokenCount
          : undefined,
      responseTokenCount:
        typeof source.usageMetadata?.responseTokenCount === 'number'
          ? source.usageMetadata.responseTokenCount
          : undefined,
    },
  };
}
