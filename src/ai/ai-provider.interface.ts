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

/** One distinct food item extracted from a raw meal description, with the
 * user's own stated quantity/unit preserved (not a default). */
export interface MealItemSegment {
  text: string;
  quantity: string | null;
  unit: string | null;
}

export interface MealSegmentationStructuredOutput {
  /** MEAL_ITEMS when the message describes food to segment; NOT_FOOD/
   * CLARIFICATION_NEEDED reuse the same passthrough handling as meal
   * estimation so this single call also covers those cases without a
   * second AI call. */
  intent: 'MEAL_ITEMS' | 'NOT_FOOD' | 'CLARIFICATION_NEEDED';
  items: MealItemSegment[];
  clarificationQuestions: string[];
  reply: string;
}

export interface AiProviderMealSegmentationResponse extends AiProviderTextResponse {
  structured: MealSegmentationStructuredOutput;
}

export interface AiProviderCoachReplyResponse extends AiProviderTextResponse {
  /** Same-pass Support Mode classification (D-068) - no extra API call. */
  supportModeTriggered: boolean;
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
  ): Promise<AiProviderCoachReplyResponse>;

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

  /**
   * Optional: splits a raw meal message into its distinct food items (each
   * with the user's own stated quantity/unit) before Food Database matching,
   * so a multi-food message is never matched/estimated as if it were one
   * food. Providers without this capability fall back to the single-call,
   * whole-message generateMealEstimate() path (see ai.service.ts).
   */
  segmentMealItems?(
    request: AiProviderRequest,
  ): Promise<AiProviderMealSegmentationResponse>;
}
