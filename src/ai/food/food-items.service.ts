import { Injectable } from '@nestjs/common';
import { FoodCategory, FoodDataConfidence, FoodSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeFoodText } from './utils/food-normalize.util';

export interface CreateFoodItemInput {
  name: string;
  category: FoodCategory;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  defaultServingDescription: string;
  defaultServingGrams: number;
  confidence: FoodDataConfidence;
  source: FoodSource;
  verified: boolean;
  /** Extra alternate spellings, beyond the food's own normalized name. */
  aliases?: string[];
}

/**
 * Every FoodItem is created with its own normalized name as an alias (plus
 * any extras given) so food-matching.service.ts only ever needs to query
 * FoodAlias, never FoodItem.name directly.
 */
@Injectable()
export class FoodItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFoodItemInput) {
    const aliasTexts = new Set<string>();
    const selfAlias = normalizeFoodText(input.name);

    if (selfAlias) {
      aliasTexts.add(selfAlias);
    }

    for (const alias of input.aliases ?? []) {
      const normalized = normalizeFoodText(alias);
      if (normalized) {
        aliasTexts.add(normalized);
      }
    }

    return this.prisma.foodItem.create({
      data: {
        name: input.name,
        category: input.category,
        caloriesPer100g: input.caloriesPer100g,
        proteinPer100g: input.proteinPer100g,
        carbsPer100g: input.carbsPer100g,
        fatPer100g: input.fatPer100g,
        defaultServingDescription: input.defaultServingDescription,
        defaultServingGrams: input.defaultServingGrams,
        confidence: input.confidence,
        source: input.source,
        verified: input.verified,
        aliases: {
          create: Array.from(aliasTexts).map((alias) => ({ alias })),
        },
      },
      include: { aliases: true },
    });
  }
}
