import { AiMemoryCategory } from '@prisma/client';
import { normalizeMemoryExtraction } from './memory-extraction.util';

describe('memory-extraction.util', () => {
  it('saves when confidence meets the threshold and all fields are valid', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'BEHAVIORAL_PATTERN',
      content: 'Only walks in the evening, never in the morning.',
      confidence: 0.8,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(true);
    expect(decision.category).toBe(AiMemoryCategory.BEHAVIORAL_PATTERN);
    expect(decision.content).toBe(
      'Only walks in the evening, never in the morning.',
    );
    expect(decision.confidence).toBe(0.8);
    expect(decision.isUserVisible).toBe(true);
  });

  it('does not save when confidence is below the threshold', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'FOOD_PREFERENCE',
      content: 'Might dislike spinach.',
      confidence: 0.4,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(false);
    expect(decision.category).toBeNull();
    expect(decision.content).toBeNull();
  });

  it('does not save when the model returns shouldSave: false', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: false,
      category: null,
      content: null,
      confidence: null,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(false);
  });

  it('does not save conversational filler with no category', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: null,
      content: 'User said thanks.',
      confidence: 0.9,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(false);
  });

  it('rejects an invalid/unknown category even at high confidence', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'SOME_MADE_UP_CATEGORY',
      content: 'Something',
      confidence: 0.9,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(false);
    expect(decision.category).toBeNull();
  });

  it('rejects empty or whitespace-only content', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'MILESTONE',
      content: '   ',
      confidence: 0.9,
      isUserVisible: true,
    });

    expect(decision.shouldSave).toBe(false);
  });

  it('defaults isUserVisible to true unless explicitly false', () => {
    const visible = normalizeMemoryExtraction({ isUserVisible: undefined });
    const hidden = normalizeMemoryExtraction({ isUserVisible: false });

    expect(visible.isUserVisible).toBe(true);
    expect(hidden.isUserVisible).toBe(false);
  });

  it('handles malformed/non-object input safely', () => {
    expect(normalizeMemoryExtraction(null).shouldSave).toBe(false);
    expect(normalizeMemoryExtraction('not json').shouldSave).toBe(false);
    expect(normalizeMemoryExtraction(undefined).shouldSave).toBe(false);
  });

  it('clamps out-of-range confidence into 0-1', () => {
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'MOTIVATION_STYLE',
      content: 'Responds well to small streaks.',
      confidence: 1.5,
      isUserVisible: true,
    });

    expect(decision.confidence).toBe(1);
  });

  it('truncates overly long content to 500 characters', () => {
    const longContent = 'x'.repeat(600);
    const decision = normalizeMemoryExtraction({
      shouldSave: true,
      category: 'PORTION_PATTERN',
      content: longContent,
      confidence: 0.9,
      isUserVisible: true,
    });

    expect(decision.content).toHaveLength(500);
  });
});
