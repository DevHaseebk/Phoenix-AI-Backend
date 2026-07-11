import {
  normalizeFoodText,
  resolvePortionGrams,
  resolveSegmentPortionGrams,
  stripPortionWords,
} from './food-normalize.util';

describe('normalizeFoodText', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeFoodText('Chicken Biryani!!  (Spicy)')).toBe(
      'chicken biryani spicy',
    );
  });
});

describe('stripPortionWords', () => {
  it('removes portion/quantity filler words', () => {
    expect(stripPortionWords('2 medium plates chicken biryani')).toBe(
      'chicken biryani',
    );
  });

  it('leaves a plain food name unchanged', () => {
    expect(stripPortionWords('chicken biryani')).toBe('chicken biryani');
  });
});

describe('resolvePortionGrams', () => {
  it('extracts an explicit gram amount', () => {
    const result = resolvePortionGrams(
      'chicken biryani 250g',
      400,
      '1 medium plate',
    );
    expect(result).toEqual({
      grams: 250,
      description: '250g',
      isDefaultServing: false,
    });
  });

  it('extracts an explicit kilogram amount', () => {
    const result = resolvePortionGrams('rice 1kg', 180, '1 cup');
    expect(result.grams).toBe(1000);
    expect(result.isDefaultServing).toBe(false);
  });

  it('multiplies the default serving for a serving-word quantity', () => {
    const result = resolvePortionGrams(
      '2 plates chicken biryani',
      400,
      '1 medium plate',
    );
    expect(result).toEqual({
      grams: 800,
      description: '2 x 1 medium plate',
      isDefaultServing: false,
    });
  });

  it('falls back to the default serving and flags the assumption when no portion is given', () => {
    const result = resolvePortionGrams(
      'chicken biryani',
      400,
      '1 medium plate',
    );
    expect(result).toEqual({
      grams: 400,
      description: '1 medium plate',
      isDefaultServing: true,
    });
  });
});

describe('resolveSegmentPortionGrams', () => {
  it('scales a count-based unit (e.g. "2 boiled eggs") by the stated quantity - the exact case resolvePortionGrams cannot handle', () => {
    const result = resolveSegmentPortionGrams(
      { quantity: '2', unit: 'large egg' },
      50,
      '1 large egg',
    );
    expect(result).toEqual({
      grams: 100,
      description: '2 x 1 large egg',
      isDefaultServing: false,
    });
  });

  it('uses a literal gram amount when the unit is a gram unit', () => {
    const result = resolveSegmentPortionGrams(
      { quantity: '100', unit: 'g' },
      400,
      '1 cup',
    );
    expect(result).toEqual({
      grams: 100,
      description: '100g',
      isDefaultServing: false,
    });
  });

  it('uses a literal kilogram amount when the unit is a kg unit', () => {
    const result = resolveSegmentPortionGrams(
      { quantity: '1.5', unit: 'kg' },
      400,
      '1 cup',
    );
    expect(result.grams).toBe(1500);
    expect(result.isDefaultServing).toBe(false);
  });

  it('falls back to the default serving when no quantity was stated', () => {
    const result = resolveSegmentPortionGrams(
      { quantity: null, unit: null },
      400,
      '1 medium plate',
    );
    expect(result).toEqual({
      grams: 400,
      description: '1 medium plate',
      isDefaultServing: true,
    });
  });

  it('treats quantity 1 with a count-based unit as exactly the default serving description', () => {
    const result = resolveSegmentPortionGrams(
      { quantity: '1', unit: 'roti' },
      40,
      '1 roti',
    );
    expect(result).toEqual({
      grams: 40,
      description: '1 roti',
      isDefaultServing: false,
    });
  });
});
