// Deterministic, non-fuzzy text normalization and portion parsing for the
// Food Database matcher (see docs/01_Decision_Log.md D-076: everyday portion
// language before grams). No embeddings/ML here by design - see
// food-matching.service.ts for how this is used.

const PORTION_WORDS = new Set([
  'g',
  'gm',
  'gms',
  'gram',
  'grams',
  'kg',
  'kilogram',
  'kilograms',
  'cup',
  'cups',
  'plate',
  'plates',
  'bowl',
  'bowls',
  'piece',
  'pieces',
  'pc',
  'pcs',
  'serving',
  'servings',
  'slice',
  'slices',
  'medium',
  'small',
  'large',
  'of',
  'a',
  'an',
  'one',
  'two',
  'three',
  'four',
  'five',
  'half',
]);

/** Lowercase, strip punctuation/diacritics, collapse whitespace. */
export function normalizeFoodText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Removes portion/quantity filler words, leaving (ideally) just the food name. */
export function stripPortionWords(normalizedText: string): string {
  return normalizedText
    .split(' ')
    .filter(
      (word) =>
        word.length > 0 &&
        !/^\d+(\.\d+)?$/.test(word) &&
        !PORTION_WORDS.has(word),
    )
    .join(' ')
    .trim();
}

const GRAM_PATTERN = /(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams)\b/;
const KG_PATTERN = /(\d+(?:\.\d+)?)\s*(?:kg|kilogram|kilograms)\b/;
const SERVING_MULTIPLIER_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:cup|cups|plate|plates|bowl|bowls|piece|pieces|pc|pcs|serving|servings|slice|slices)\b/;

export interface PortionResolution {
  grams: number;
  description: string;
  isDefaultServing: boolean;
}

/**
 * Extracts a portion in grams from free text. Falls back to the food's own
 * default serving when no quantity/unit is mentioned - this is the "note the
 * assumption" path the caller must surface to the user.
 */
export function resolvePortionGrams(
  normalizedText: string,
  defaultServingGrams: number,
  defaultServingDescription: string,
): PortionResolution {
  const gramMatch = normalizedText.match(GRAM_PATTERN);
  if (gramMatch) {
    const grams = Number(gramMatch[1]);
    return { grams, description: `${gramMatch[1]}g`, isDefaultServing: false };
  }

  const kgMatch = normalizedText.match(KG_PATTERN);
  if (kgMatch) {
    const grams = Number(kgMatch[1]) * 1000;
    return { grams, description: `${kgMatch[1]}kg`, isDefaultServing: false };
  }

  const servingMatch = normalizedText.match(SERVING_MULTIPLIER_PATTERN);
  if (servingMatch) {
    const multiplier = Number(servingMatch[1]);
    const grams = multiplier * defaultServingGrams;
    return {
      grams,
      description:
        multiplier === 1
          ? defaultServingDescription
          : `${multiplier} x ${defaultServingDescription}`,
      isDefaultServing: false,
    };
  }

  return {
    grams: defaultServingGrams,
    description: defaultServingDescription,
    isDefaultServing: true,
  };
}

export interface SegmentPortion {
  quantity: string | null;
  unit: string | null;
}

const SEGMENT_GRAM_UNITS = new Set(['g', 'gm', 'gms', 'gram', 'grams']);
const SEGMENT_KG_UNITS = new Set(['kg', 'kilogram', 'kilograms']);

/**
 * Resolves a portion in grams from an AI segmentation step's already-split
 * quantity/unit fields (e.g. {quantity: "2", unit: "large egg"}) instead of
 * re-parsing free text. Unlike resolvePortionGrams()'s regex tiers, this
 * correctly scales count-based units (egg, roti, slice, ...) because the
 * segmentation step has already isolated the user's stated count - it does
 * not need to recognize the unit word itself to know "2" means 2x.
 */
export function resolveSegmentPortionGrams(
  segment: SegmentPortion,
  defaultServingGrams: number,
  defaultServingDescription: string,
): PortionResolution {
  const quantity = Number(segment.quantity);
  const hasQuantity =
    segment.quantity !== null && Number.isFinite(quantity) && quantity > 0;
  const unit = segment.unit?.trim().toLowerCase() ?? null;

  if (hasQuantity && unit && SEGMENT_GRAM_UNITS.has(unit)) {
    return {
      grams: quantity,
      description: `${quantity}g`,
      isDefaultServing: false,
    };
  }

  if (hasQuantity && unit && SEGMENT_KG_UNITS.has(unit)) {
    return {
      grams: quantity * 1000,
      description: `${quantity}kg`,
      isDefaultServing: false,
    };
  }

  if (hasQuantity) {
    return {
      grams: quantity * defaultServingGrams,
      description:
        quantity === 1
          ? defaultServingDescription
          : `${quantity} x ${defaultServingDescription}`,
      isDefaultServing: false,
    };
  }

  return {
    grams: defaultServingGrams,
    description: defaultServingDescription,
    isDefaultServing: true,
  };
}
