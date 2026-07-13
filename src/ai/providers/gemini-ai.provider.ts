import { ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiEmbeddingRequest,
  AiProvider,
  AiProviderCoachReplyResponse,
  AiProviderMealEstimateResponse,
  AiProviderMealSegmentationResponse,
  AiProviderMemoryExtractionResponse,
  AiProviderRequest,
  AiProviderWeeklyReviewResponse,
  MealEstimateStructuredOutput,
  MealSegmentationStructuredOutput,
  MemoryExtractionStructuredOutput,
  WeeklyReviewStructuredOutput,
} from '../ai-provider.interface';
import { chatReplyResponseSchema } from '../schemas/chat-reply.schema';
import { mealEstimateResponseSchema } from '../schemas/meal-estimate.schema';
import { mealSegmentationResponseSchema } from '../schemas/meal-segmentation.schema';
import { memoryExtractionResponseSchema } from '../schemas/memory-extraction.schema';
import { weeklyReviewResponseSchema } from '../schemas/weekly-review.schema';
import { normalizeChatReply } from '../utils/chat-reply.util';

/** Keeps the per-turn extraction call cheap: a short JSON verdict, nothing more. */
const memoryExtractionMaxOutputTokens = 200;

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
  ): Promise<AiProviderCoachReplyResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\nUser:\n${request.userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: chatReplyResponseSchema,
        },
      }),
      request.timeoutMs,
    );
    const response = toGeminiResponse(rawResponse);
    const content = response.text?.trim();

    if (!content) {
      throw new ServiceUnavailableException('AI response was empty');
    }

    const normalized = normalizeChatReply(this.parseChatReply(content));

    return {
      content: normalized.reply,
      supportModeTriggered: normalized.supportModeTriggered,
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

  async segmentMealItems(
    request: AiProviderRequest,
  ): Promise<AiProviderMealSegmentationResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\nMeal text:\n${request.userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: mealSegmentationResponseSchema,
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
      structured: this.parseSegmentation(content),
      model: request.model,
      latencyMs: Date.now() - startedAt,
      tokenInput: response.usageMetadata?.promptTokenCount,
      tokenOutput: response.usageMetadata?.responseTokenCount,
    };
  }

  async extractMemory(
    request: AiProviderRequest,
  ): Promise<AiProviderMemoryExtractionResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\nChat turn:\n${request.userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: memoryExtractionResponseSchema,
          maxOutputTokens: memoryExtractionMaxOutputTokens,
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
      structured: this.parseMemoryExtraction(content),
      model: request.model,
      latencyMs: Date.now() - startedAt,
      tokenInput: response.usageMetadata?.promptTokenCount,
      tokenOutput: response.usageMetadata?.responseTokenCount,
    };
  }

  async generateWeeklyReview(
    request: AiProviderRequest,
  ): Promise<AiProviderWeeklyReviewResponse> {
    const startedAt = Date.now();
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.generateContent({
        model: request.model,
        contents: `${request.systemPrompt}\n\n${request.userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: weeklyReviewResponseSchema,
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
      structured: this.parseWeeklyReview(content),
      model: request.model,
      latencyMs: Date.now() - startedAt,
      tokenInput: response.usageMetadata?.promptTokenCount,
      tokenOutput: response.usageMetadata?.responseTokenCount,
    };
  }

  async generateEmbeddings(request: AiEmbeddingRequest): Promise<number[][]> {
    const rawResponse: unknown = await this.withTimeout(
      this.client.models.embedContent({
        model: request.model,
        contents: request.inputs,
        config: {
          taskType: request.taskType,
          outputDimensionality: request.outputDimensionality,
        },
      }),
      request.timeoutMs,
    );
    const embeddings = extractEmbeddings(rawResponse);

    if (embeddings.length !== request.inputs.length) {
      throw new ServiceUnavailableException(
        'AI embedding response was incomplete',
      );
    }

    // Truncated gemini-embedding output is not unit-normalized; normalize so
    // stored vectors behave consistently under cosine similarity.
    return embeddings.map(normalizeVector);
  }

  private parseChatReply(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      // normalizeChatReply() handles null/malformed input with a safe fallback
      // reply - the primary chat path should degrade gracefully, not hard-fail.
      return null;
    }
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

  private parseSegmentation(content: string): MealSegmentationStructuredOutput {
    try {
      return JSON.parse(content) as MealSegmentationStructuredOutput;
    } catch {
      throw new ServiceUnavailableException(
        'AI returned invalid structured data',
      );
    }
  }

  private parseMemoryExtraction(
    content: string,
  ): MemoryExtractionStructuredOutput {
    try {
      return JSON.parse(content) as MemoryExtractionStructuredOutput;
    } catch {
      throw new ServiceUnavailableException(
        'AI returned invalid structured data',
      );
    }
  }

  private parseWeeklyReview(content: string): WeeklyReviewStructuredOutput {
    try {
      return JSON.parse(content) as WeeklyReviewStructuredOutput;
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

function extractEmbeddings(value: unknown): number[][] {
  if (value === null || typeof value !== 'object') {
    return [];
  }

  const source = value as { embeddings?: Array<{ values?: unknown }> };

  if (!Array.isArray(source.embeddings)) {
    return [];
  }

  return source.embeddings
    .map((embedding) =>
      Array.isArray(embedding.values)
        ? embedding.values.filter(
            (item): item is number => typeof item === 'number',
          )
        : [],
    )
    .filter((values) => values.length > 0);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((total, value) => total + value * value, 0),
  );

  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
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
