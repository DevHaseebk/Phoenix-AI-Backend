import { chunkText, estimateTokenCount } from './rag-chunking.util';

describe('rag-chunking.util', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('One short sentence. Another short sentence.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content).toContain('One short sentence.');
    expect(chunks[0].tokenCount).toBe(estimateTokenCount(chunks[0].content));
  });

  it('returns no chunks for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('splits long text into multiple chunks within the size limit', () => {
    const sentence =
      'Consistency beats perfection when you are building daily habits. ';
    const longText = sentence.repeat(80); // ~5200 chars

    const chunks = chunkText(longText, { maxChars: 1000, overlapChars: 150 });

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      // Overlap can push slightly past maxChars by up to one sentence.
      expect(chunk.content.length).toBeLessThanOrEqual(1000 + 200);
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it('does not cut sentences in half at chunk boundaries', () => {
    const sentences = Array.from(
      { length: 40 },
      (_, index) =>
        `Sentence number ${index} talks about walking, protein, and steady progress.`,
    );
    const chunks = chunkText(sentences.join(' '), {
      maxChars: 500,
      overlapChars: 0,
    });

    for (const chunk of chunks) {
      expect(chunk.content.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  it('repeats trailing content as overlap in the next chunk', () => {
    const sentences = Array.from(
      { length: 30 },
      (_, index) => `Unique marker sentence ${index} ends here.`,
    );
    const chunks = chunkText(sentences.join(' '), {
      maxChars: 400,
      overlapChars: 120,
    });

    expect(chunks.length).toBeGreaterThan(1);
    const firstChunkTail = chunks[0].content.slice(-60);
    const markerMatch = firstChunkTail.match(/marker sentence (\d+)/);

    expect(markerMatch).not.toBeNull();
    expect(chunks[1].content).toContain(`marker sentence ${markerMatch![1]}`);
  });
});
