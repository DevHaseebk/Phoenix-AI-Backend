export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

export interface ChunkingOptions {
  /** Soft maximum characters per chunk (~4 chars per token). */
  maxChars?: number;
  /** Trailing sentences from the previous chunk repeated at the start of the next. */
  overlapChars?: number;
}

const defaultMaxChars = 1400;
const defaultOverlapChars = 200;

/** Rough token estimate (~4 characters per token for English text). */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Splits document text into overlapping chunks along sentence boundaries so
 * ideas are not cut mid-sentence. Paragraph breaks are preserved inside a
 * chunk when they fit.
 */
export function chunkText(
  text: string,
  options: ChunkingOptions = {},
): TextChunk[] {
  const maxChars = options.maxChars ?? defaultMaxChars;
  const overlapChars = options.overlapChars ?? defaultOverlapChars;
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return [];
  }

  const sentences = splitIntoSentences(normalized);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = `${buildOverlap(current, overlapChars)}${sentence}`.trim();
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.map((content, chunkIndex) => ({
    content,
    chunkIndex,
    tokenCount: estimateTokenCount(content),
  }));
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length > 0);
}

function buildOverlap(previousChunk: string, overlapChars: number): string {
  if (overlapChars <= 0) {
    return '';
  }

  const tail = previousChunk.slice(-overlapChars);
  // Start the overlap at a sentence boundary inside the tail when possible.
  const sentenceStart = tail.search(/(?<=[.!?])\s+/);
  const overlap =
    sentenceStart >= 0 ? tail.slice(sentenceStart).trim() : tail.trim();

  return overlap ? `${overlap} ` : '';
}
