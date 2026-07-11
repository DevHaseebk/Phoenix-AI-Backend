/**
 * One-time repair: re-fetches every existing source: USDA FoodItem by its
 * exact stored name and re-extracts calories/protein/carbs/fat with the
 * fixed, unit-aware extractNutrient() from usda-import.ts (USDA returns
 * "Energy" in both kJ and KCAL per food, in an order that isn't consistent
 * across foods; the original import picked whichever came first, which was
 * kJ - about 4.18x too high - for roughly a third of the imported items).
 *
 * Run with: npm run fix:usda-energy
 *
 * Updates only the four macro fields on existing rows - does not touch
 * name, category, source, verified, or aliases.
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();

const REQUEST_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UsdaFoodNutrient {
  nutrientName: string;
  unitName?: string;
  value: number;
}

interface UsdaSearchResultFood {
  description: string;
  foodNutrients: UsdaFoodNutrient[];
}

interface UsdaSearchResponse {
  foods: UsdaSearchResultFood[];
}

function extractNutrient(
  nutrients: UsdaFoodNutrient[],
  name: string,
  preferredUnit?: string,
): number {
  const matches = nutrients.filter((nutrient) =>
    nutrient.nutrientName.toLowerCase().includes(name.toLowerCase()),
  );

  if (matches.length === 0) {
    return 0;
  }

  if (preferredUnit) {
    const unitMatch = matches.find(
      (nutrient) => nutrient.unitName?.toUpperCase() === preferredUnit,
    );

    if (unitMatch) {
      return unitMatch.value;
    }
  }

  return matches[0].value;
}

async function searchUsdaFoodByExactName(
  apiKey: string,
  name: string,
): Promise<UsdaSearchResultFood | null> {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', name);
  url.searchParams.set('dataType', 'Foundation,SR Legacy');
  url.searchParams.set('pageSize', '5');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`USDA search failed for "${name}": ${response.status}`);
  }

  const body = (await response.json()) as UsdaSearchResponse;

  return body.foods.find((food) => food.description === name) ?? body.foods[0] ?? null;
}

async function main(): Promise<void> {
  const apiKey = process.env.USDA_API_KEY;

  if (!apiKey) {
    throw new Error('USDA_API_KEY is required to run this repair script.');
  }

  const prisma = new PrismaClient();
  let fixed = 0;
  let unchanged = 0;
  let failed = 0;

  try {
    const usdaItems = await prisma.foodItem.findMany({
      where: { source: 'USDA' },
    });

    for (const item of usdaItems) {
      try {
        await sleep(REQUEST_DELAY_MS);
        const food = await searchUsdaFoodByExactName(apiKey, item.name);

        if (!food) {
          console.warn(`Could not re-fetch "${item.name}", leaving as-is.`);
          failed += 1;
          continue;
        }

        const caloriesPer100g = extractNutrient(food.foodNutrients, 'Energy', 'KCAL');
        const proteinPer100g = extractNutrient(food.foodNutrients, 'Protein');
        const carbsPer100g = extractNutrient(food.foodNutrients, 'Carbohydrate');
        const fatPer100g = extractNutrient(food.foodNutrients, 'total lipid');

        const oldCalories = Number(item.caloriesPer100g);
        const changed = Math.abs(oldCalories - caloriesPer100g) > 0.5;

        await prisma.foodItem.update({
          where: { id: item.id },
          data: { caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g },
        });

        if (changed) {
          fixed += 1;
          console.log(
            `Fixed "${item.name}": ${oldCalories} -> ${caloriesPer100g} kcal/100g`,
          );
        } else {
          unchanged += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(`Error re-fetching "${item.name}":`, error);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nDone. Fixed: ${fixed}, already correct: ${unchanged}, failed: ${failed}.`);
}

main().catch((error) => {
  console.error('USDA energy-unit repair failed:', error);
  process.exitCode = 1;
});
