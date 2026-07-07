import { detectSafetyFlags } from './ai-safety.util';

describe('detectSafetyFlags', () => {
  it('blocks dangerous dieting and medical dosing requests', () => {
    const result = detectSafetyFlags(
      'Can I use ozempic dose and eat 500 calories daily?',
    );

    expect(result.blocked).toBe(true);
    expect(result.categories).toEqual(
      expect.arrayContaining(['EXTREME_DIETING', 'MEDICATION_DOSING']),
    );
    expect(result.message).toContain('cannot help');
  });

  it('allows normal meal and accountability requests', () => {
    const result = detectSafetyFlags('What should I eat for dinner today?');

    expect(result).toEqual({
      blocked: false,
      categories: [],
    });
  });
});
