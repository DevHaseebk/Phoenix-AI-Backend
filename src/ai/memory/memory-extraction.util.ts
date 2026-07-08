import { AiMemoryCategory } from '@prisma/client';
import { MemoryExtractionStructuredOutput } from '../ai-provider.interface';

/** Memory Write Rules (02_Product_Bible.md §16.5 / 04_Technical_Architecture.md §17.2). */
export const minimumSaveConfidence = 0.6;

export interface NormalizedMemoryDecision {
  shouldSave: boolean;
  category: AiMemoryCategory | null;
  content: string | null;
  confidence: number | null;
  isUserVisible: boolean;
}

const validCategories = new Set<string>(Object.values(AiMemoryCategory));

/**
 * Applies the memory write rules to a raw extraction verdict: only save when
 * the model was confident, named a valid category, and gave real content.
 * Defensive against a model that says shouldSave: true but omits fields.
 */
export function normalizeMemoryExtraction(
  raw: unknown,
): NormalizedMemoryDecision {
  const source = asRecord(raw);
  const category = normalizeCategory(source.category);
  const content = normalizeContent(source.content);
  const confidence = normalizeConfidence(source.confidence);
  const isUserVisible = source.isUserVisible !== false;
  const requestedSave = source.shouldSave === true;

  const shouldSave =
    requestedSave &&
    category !== null &&
    content !== null &&
    confidence !== null &&
    confidence >= minimumSaveConfidence;

  return {
    shouldSave,
    category: shouldSave ? category : null,
    content: shouldSave ? content : null,
    confidence: shouldSave ? confidence : null,
    isUserVisible,
  };
}

function asRecord(value: unknown): Partial<MemoryExtractionStructuredOutput> {
  return value !== null && typeof value === 'object' ? value : {};
}

function normalizeCategory(value: unknown): AiMemoryCategory | null {
  return typeof value === 'string' && validCategories.has(value)
    ? (value as AiMemoryCategory)
    : null;
}

function normalizeContent(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().slice(0, 500);

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConfidence(value: unknown): number | null {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 1) : null;
}
