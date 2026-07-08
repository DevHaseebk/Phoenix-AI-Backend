import { ConfidenceLevel, MealType } from '@prisma/client';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiSafetyFlags {
  blocked: boolean;
  categories: string[];
  message?: string;
}

export interface AiProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  timeoutMs: number;
}

export interface AiEmbeddingRequest {
  inputs: string[];
  model: string;
  timeoutMs: number;
  /** Gemini embedding task type, e.g. RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY. */
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
  outputDimensionality: number;
}

export interface AiProviderTextResponse {
  content: string;
  model: string;
  latencyMs: number;
  tokenInput?: number;
  tokenOutput?: number;
}

export interface MealEstimateItemOutput {
  name: string;
  quantityText: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number | null;
  assumptions: string[];
}

export interface MealEstimateStructuredOutput {
  intent: 'MEAL_ESTIMATE' | 'CLARIFICATION_NEEDED' | 'NOT_FOOD';
  summary: string;
  confidenceLevel: Exclude<ConfidenceLevel, 'VERIFIED'>;
  confidenceScore: number;
  mealType: MealType | null;
  items: MealEstimateItemOutput[];
  totals: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number | null;
  };
  clarificationQuestions: string[];
  assumptions: string[];
  warnings: string[];
  reply: string;
}

export interface AiProviderMealEstimateResponse extends AiProviderTextResponse {
  structured: MealEstimateStructuredOutput;
}

export interface MemoryExtractionStructuredOutput {
  shouldSave: boolean;
  category: string | null;
  content: string | null;
  confidence: number | null;
  isUserVisible: boolean;
}

export interface AiProviderMemoryExtractionResponse extends AiProviderTextResponse {
  structured: MemoryExtractionStructuredOutput;
}

export interface AiProvider {
  generateCoachReply(
    request: AiProviderRequest,
  ): Promise<AiProviderTextResponse>;

  generateMealEstimate(
    request: AiProviderRequest,
  ): Promise<AiProviderMealEstimateResponse>;

  /**
   * Optional: providers without a real embedding backend (e.g. the local
   * fallback) omit this, and RAG retrieval is skipped gracefully.
   */
  generateEmbeddings?(request: AiEmbeddingRequest): Promise<number[][]>;

  /**
   * Optional: cheap, structured-output extraction of a single memory-worthy
   * fact (or none) from a chat turn. Providers without this capability skip
   * memory extraction gracefully.
   */
  extractMemory?(
    request: AiProviderRequest,
  ): Promise<AiProviderMemoryExtractionResponse>;
}
