import { Injectable, Logger } from '@nestjs/common';
import { ConfidenceLevel, FoodDataConfidence, MealType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { MealEstimateStructuredOutput } from '../ai-provider.interface';
import {
  normalizeFoodText,
  resolvePortionGrams,
  resolveSegmentPortionGrams,
  SegmentPortion,
  stripPortionWords,
} from './utils/food-normalize.util';

export interface FoodMatchResult {
  structured: MealEstimateStructuredOutput;
  foodItemId: string;
  /**
   * EXACT: the (portion-stripped) text equals a known alias exactly - safe
   * to trust even for a whole, unsegmented message. CONTAINMENT: an alias
   * was merely found as a substring - reliable for a single, already
   * isolated food segment, but NOT safe to trust for a raw multi-food
   * message (a fragment match can silently hide the other foods mentioned -
   * see docs/01_Decision_Log.md and the estimateMeal() segmentation fix).
   */
  matchTier: 'EXACT' | 'CONTAINMENT';
}

const confidenceScoreByLevel: Record<FoodDataConfidence, number> = {
  LOW: 0.55,
  MEDIUM: 0.8,
  HIGH: 0.95,
};

/**
 * Deterministic Food Database matcher (docs/01_Decision_Log.md D-071/D-073).
 * Intentionally simple for MVP: exact alias match, then a match after
 * stripping portion/quantity words, then whole-word substring containment
 * (longest alias wins). No embeddings/fuzzy matching - see report for why.
 */
@Injectable()
export class FoodMatchingService {
  private readonly logger = new Logger(FoodMatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveMatch(
    text: string,
    requestedMealType?: MealType,
    explicitPortion?: SegmentPortion,
  ): Promise<FoodMatchResult | null> {
    const normalized = normalizeFoodText(text);

    if (!normalized) {
      return null;
    }

    const stripped = stripPortionWords(normalized);
    const candidateTexts = Array.from(
      new Set([normalized, stripped].filter((value) => value.length > 0)),
    );

    const exactMatch = await this.prisma.foodAlias.findFirst({
      where: { alias: { in: candidateTexts } },
      include: { foodItem: true },
    });

    const match =
      exactMatch ?? (await this.findByContainment(stripped || normalized));

    if (!match) {
      return null;
    }

    const matchTier: 'EXACT' | 'CONTAINMENT' = exactMatch
      ? 'EXACT'
      : 'CONTAINMENT';
    const foodItem = match.foodItem;
    const portion = explicitPortion
      ? resolveSegmentPortionGrams(
          explicitPortion,
          Number(foodItem.defaultServingGrams),
          foodItem.defaultServingDescription,
        )
      : resolvePortionGrams(
          normalized,
          Number(foodItem.defaultServingGrams),
          foodItem.defaultServingDescription,
        );
    const scale = portion.grams / 100;
    const calories = roundToInt(Number(foodItem.caloriesPer100g) * scale);
    const proteinGrams = roundOne(Number(foodItem.proteinPer100g) * scale);
    const carbsGrams = foodItem.carbsPer100g
      ? roundOne(Number(foodItem.carbsPer100g) * scale)
      : 0;
    const fatGrams = foodItem.fatPer100g
      ? roundOne(Number(foodItem.fatPer100g) * scale)
      : 0;
    const assumptions = portion.isDefaultServing
      ? [
          `Assumed a default serving of ${foodItem.defaultServingDescription} (${Number(
            foodItem.defaultServingGrams,
          )}g) since no portion was specified.`,
        ]
      : [];

    this.logger.debug(
      `Food DB match for "${text}" -> ${foodItem.name} (${foodItem.source}, ${foodItem.confidence})`,
    );

    return {
      foodItemId: foodItem.id,
      matchTier,
      structured: {
        intent: 'MEAL_ESTIMATE',
        summary: `${foodItem.name} (${portion.description})`,
        confidenceLevel: toConfidenceLevel(foodItem.confidence),
        confidenceScore: confidenceScoreByLevel[foodItem.confidence],
        mealType: requestedMealType ?? null,
        items: [
          {
            name: foodItem.name,
            quantityText: portion.description,
            calories,
            proteinGrams,
            carbsGrams,
            fatGrams,
            fiberGrams: null,
            assumptions,
          },
        ],
        totals: {
          calories,
          proteinGrams,
          carbsGrams,
          fatGrams,
          fiberGrams: null,
        },
        clarificationQuestions: [],
        assumptions,
        warnings: [],
        reply: `${foodItem.name}, ${portion.description}: about ${calories} kcal and ${proteinGrams}g protein, from our food database.`,
      },
    };
  }

  /**
   * Whole-word substring containment: does any known alias appear as a
   * complete word sequence inside the (portion-stripped) input, or vice
   * versa? Picks the longest matching alias to avoid short generic words
   * (e.g. "rice") winning over more specific ones (e.g. "chicken biryani").
   */
  private async findByContainment(strippedText: string) {
    if (!strippedText) {
      return null;
    }

    const aliases = await this.prisma.foodAlias.findMany({
      include: { foodItem: true },
    });

    let best: (typeof aliases)[number] | null = null;

    for (const candidate of aliases) {
      const alias = candidate.alias;

      if (!alias) {
        continue;
      }

      const isContained =
        containsWholeWords(strippedText, alias) ||
        containsWholeWords(alias, strippedText);

      if (isContained && (!best || alias.length > best.alias.length)) {
        best = candidate;
      }
    }

    return best;
  }
}

function containsWholeWords(haystack: string, needle: string): boolean {
  if (!needle) {
    return false;
  }

  return new RegExp(`(?:^|\\s)${escapeRegExp(needle)}(?:\\s|$)`).test(
    ` ${haystack} `,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toConfidenceLevel(
  confidence: FoodDataConfidence,
): Exclude<ConfidenceLevel, 'VERIFIED'> {
  return confidence;
}

function roundToInt(value: number): number {
  return Math.round(value);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
