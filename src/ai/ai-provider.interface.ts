import { ConfidenceLevel, ExerciseType, MealType } from '@prisma/client';

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
  /** Local calendar date (YYYY-MM-DD) this item belongs to, resolved from
   * relative phrasing ("kal", "yesterday") by segmentation. null/absent =
   * unspecified, treated as today at confirm time. */
  resolvedDate?: string | null;
  /** Meal of the day this item was stated to belong to ("in breakfast..."),
   * used to group items into per-meal logs at confirm time. */
  mealSlot?: MealType | null;
}

/** One exercise activity extracted from a day-activity message. Calories are
 * computed deterministically (MET formula, logs/utils/exercise-calorie-
 * estimate.util.ts) - never AI-estimated. */
export interface ExerciseEstimateItemOutput {
  name: string;
  exerciseType: ExerciseType;
  durationMinutes: number;
  distanceKm: number | null;
  steps: number | null;
  estimatedCaloriesBurned: number | null;
  resolvedDate?: string | null;
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

/** One distinct day-activity item (a food OR an exercise) extracted from a
 * raw message, with the user's own stated quantity/duration preserved (not a
 * default) and any relative date reference ("kal", "yesterday", "this
 * morning") resolved to an absolute local calendar date. */
export interface MealItemSegment {
  /** FOOD (default when the model omits it) or EXERCISE. */
  itemType: 'FOOD' | 'EXERCISE';
  text: string;
  /** Food only: user's own stated quantity, never invented. */
  quantity: string | null;
  unit: string | null;
  /** Food only: the meal of the day the user assigned this item to. */
  mealSlot: MealType | null;
  /** Exercise only. */
  durationMinutes: number | null;
  distanceKm: number | null;
  steps: number | null;
  /** Absolute local date (YYYY-MM-DD) for THIS item - a single message can
   * span multiple days. null = unspecified (safe default: today). */
  date: string | null;
}

export interface MealSegmentationStructuredOutput {
  /** MEAL_ITEMS when the message describes loggable food and/or exercise
   * activity; NOT_FOOD/CLARIFICATION_NEEDED reuse the same passthrough
   * handling as meal estimation so this single call also covers those cases
   * without a second AI call. */
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

export interface WeeklyReviewStructuredOutput {
  summary: string;
  whatWorked: string;
  whatGotDifficult: string;
  /** 1-3 short, concrete actions for next week. */
  nextWeekFocus: string[];
}

export interface AiProviderWeeklyReviewResponse extends AiProviderTextResponse {
  structured: WeeklyReviewStructuredOutput;
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
   * Optional: unified day-activity segmentation - splits a raw message into
   * its distinct FOOD and EXERCISE items (each with the user's own stated
   * quantity/duration and an absolute per-item date resolved from relative
   * phrasing like "kal"/"yesterday") before Food Database matching, so a
   * multi-item message is never matched/estimated as if it were one food and
   * exercise mentions are never silently dropped. Providers without this
   * capability fall back to the single-call, whole-message
   * generateMealEstimate() path (see meal-item-resolver.service.ts).
   */
  segmentMealItems?(
    request: AiProviderRequest,
  ): Promise<AiProviderMealSegmentationResponse>;

  /**
   * Optional: generates the Weekly Review narrative (summary/whatWorked/
   * whatGotDifficult/nextWeekFocus) from server-computed stats. Providers
   * without this capability cause Review Mode to persist stats-only with
   * aiSummary: null (see review.service.ts) rather than failing generation.
   */
  generateWeeklyReview?(
    request: AiProviderRequest,
  ): Promise<AiProviderWeeklyReviewResponse>;
}
