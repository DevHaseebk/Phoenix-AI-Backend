/**
 * Food Database seed: Pakistani/restaurant pack (source: AI_ESTIMATE,
 * verified: false - AI-drafted, not founder-reviewed yet) plus an interim
 * generic-foods pack (source: PHOENIX_DB, verified: false - stand-in until
 * prisma/usda-import.ts is run with a real USDA_API_KEY; see that file).
 *
 * Run with: npm run seed:food-db
 *
 * Idempotent: re-running replaces any existing FoodItem with the same name
 * (aliases cascade-delete with it) so this can be safely re-run after
 * editing prisma/seed-food-content.ts.
 */
import { PrismaClient } from '@prisma/client';
import { normalizeFoodText } from '../src/ai/food/utils/food-normalize.util';
import {
  FoodSeedEntry,
  genericFoodPack,
  pakistaniFoodPack,
} from './seed-food-content';

async function seedPack(
  prisma: PrismaClient,
  pack: FoodSeedEntry[],
  source: 'AI_ESTIMATE' | 'PHOENIX_DB',
  confidence: 'LOW' | 'MEDIUM' | 'HIGH',
): Promise<void> {
  for (const entry of pack) {
    await prisma.foodItem.deleteMany({ where: { name: entry.name } });

    const aliasTexts = new Set<string>();
    const selfAlias = normalizeFoodText(entry.name);
    if (selfAlias) {
      aliasTexts.add(selfAlias);
    }
    for (const alias of entry.aliases) {
      const normalized = normalizeFoodText(alias);
      if (normalized) {
        aliasTexts.add(normalized);
      }
    }

    await prisma.foodItem.create({
      data: {
        name: entry.name,
        category: entry.category,
        caloriesPer100g: entry.caloriesPer100g,
        proteinPer100g: entry.proteinPer100g,
        carbsPer100g: entry.carbsPer100g,
        fatPer100g: entry.fatPer100g,
        defaultServingDescription: entry.defaultServingDescription,
        defaultServingGrams: entry.defaultServingGrams,
        confidence,
        source,
        verified: false,
        aliases: {
          create: Array.from(aliasTexts).map((alias) => ({ alias })),
        },
      },
    });
  }

  console.log(`Seeded ${pack.length} ${source} food items.`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedPack(prisma, pakistaniFoodPack, 'AI_ESTIMATE', 'MEDIUM');
    await seedPack(prisma, genericFoodPack, 'PHOENIX_DB', 'MEDIUM');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Food DB seed failed:', error);
  process.exitCode = 1;
});
