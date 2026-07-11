/**
 * USDA FoodData Central import (docs/01_Decision_Log.md D-072): upserts
 * common generic/global foods as FoodItem rows with source: USDA,
 * verified: true - authoritative baseline data for foods that aren't
 * Pakistani-specific (see prisma/seed-food-db.ts for that pack).
 *
 * Get a free key: https://fdc.nal.usda.gov/api-key-signup.html
 * Set USDA_API_KEY in backend/.env, then run: npm run seed:usda
 *
 * Uses the public FoodData Central "Foundation" + "SR Legacy" data types via
 * GET https://api.nal.usda.gov/fdc/v1/foods/search - a curated, common-foods
 * subset only, never a full DB dump. Requests are throttled (350ms apart) to
 * stay well under USDA's per-key rate limit.
 *
 * Duplicate avoidance (see resolveExistingCollisions()): before importing a
 * target's aliases,
 *   - if any alias already belongs to a source: USDA item, the target is
 *     considered already covered and is skipped entirely (no API call).
 *   - if any alias belongs to a source: PHOENIX_DB (interim, unverified)
 *     item, that item is superseded: its own non-colliding aliases are
 *     migrated onto the new USDA item, then the interim item is deleted.
 *     This is the "USDA upgrades the interim generic pack" path the interim
 *     pack was always meant to be replaced by.
 *   - if any alias belongs to a source: AI_ESTIMATE or FOUNDER_REVIEWED item
 *     (the Pakistani/restaurant pack, or a founder-approved item), that
 *     specific alias is left with the existing item and not attached to the
 *     new USDA item, since those packs take priority for their own terms.
 *
 * A lightweight sanity check (wordOverlapLooksWrong()) skips a USDA search
 * result that shares no meaningful words with the query - this is not a
 * rewrite of the "pick the single top result" strategy, just a guard against
 * USDA's search occasionally ranking a wrong-species result first (found
 * live in this task: "milk, whole" incorrectly top-matched "Cheese,
 * mozzarella, whole milk"; see fixPreExistingCollisions() for how the three
 * already-imported mismatches from the original 10-item run were resolved
 * without altering those FoodItem rows themselves).
 */
import { config } from 'dotenv';
import { FoodCategory, FoodSource, PrismaClient } from '@prisma/client';
import { normalizeFoodText } from '../src/ai/food/utils/food-normalize.util';

config();

const REQUEST_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UsdaSearchTarget {
  query: string;
  category: FoodCategory;
  defaultServingDescription: string;
  defaultServingGrams: number;
  aliases: string[];
}

// New targets only - the original 10 (egg/chicken breast/rice/milk/apple/
// banana/potato/spinach/bread/yogurt) were already imported in a prior run
// and are intentionally NOT re-queried here (see task scope: "do not touch
// the already-imported 10 items"). No Pakistani-specific dishes (those stay
// in prisma/seed-food-content.ts's pakistaniFoodPack, sourced from AI
// estimates, not USDA, per D-072/D-073). Query phrasing favors USDA's own
// Foundation/SR Legacy naming style for more reliable top-result matches.
const usdaSearchTargets: UsdaSearchTarget[] = [
  // Proteins
  { query: 'beef, ground, 85% lean meat, cooked', category: 'PROTEIN', defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['ground beef', 'minced beef'] },
  { query: 'lamb, cooked', category: 'PROTEIN', defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['mutton meat', 'goat meat'] },
  { query: 'tuna, canned in water, drained', category: 'PROTEIN', defaultServingDescription: '1 small can', defaultServingGrams: 140, aliases: ['canned tuna', 'tuna fish'] },
  { query: 'salmon, cooked', category: 'PROTEIN', defaultServingDescription: '1 fillet', defaultServingGrams: 120, aliases: ['grilled salmon', 'salmon fillet'] },
  { query: 'shrimp, cooked', category: 'PROTEIN', defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['prawns cooked'] },
  { query: 'tofu, firm, raw', category: 'PROTEIN', defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['bean curd'] },
  { query: 'lentils, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 200, aliases: ['boiled lentils', 'cooked dal generic'] },
  { query: 'chickpeas, mature seeds, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 165, aliases: ['boiled chickpeas'] },
  { query: 'kidney beans, mature seeds, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 175, aliases: ['boiled kidney beans'] },
  { query: 'black beans, mature seeds, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 170, aliases: ['boiled black beans'] },
  { query: 'turkey, breast, cooked', category: 'PROTEIN', defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['turkey breast'] },
  { query: 'cashew nuts, raw', category: 'SNACK', defaultServingDescription: '1 small handful', defaultServingGrams: 30, aliases: ['cashews'] },

  // Grains/carbs
  { query: 'rice, brown, long-grain, cooked', category: 'MAIN_DISH', defaultServingDescription: '1 cup', defaultServingGrams: 195, aliases: ['brown rice cooked'] },
  { query: 'oats, raw', category: 'MAIN_DISH', defaultServingDescription: '1 cup dry', defaultServingGrams: 80, aliases: ['dry oats', 'rolled oats'] },
  { query: 'pasta, cooked, unenriched, without added salt', category: 'MAIN_DISH', defaultServingDescription: '1 cup', defaultServingGrams: 140, aliases: ['boiled pasta', 'cooked spaghetti'] },
  { query: 'quinoa, cooked', category: 'MAIN_DISH', defaultServingDescription: '1 cup', defaultServingGrams: 185, aliases: [] },
  { query: 'wheat flour, whole-grain', category: 'OTHER', defaultServingDescription: '1 cup', defaultServingGrams: 120, aliases: ['atta', 'whole wheat flour'] },
  { query: 'cornmeal, whole-grain, yellow', category: 'OTHER', defaultServingDescription: '1 cup', defaultServingGrams: 120, aliases: ['makai atta'] },

  // Vegetables
  { query: 'tomatoes, red, ripe, raw', category: 'VEGETABLE', defaultServingDescription: '1 medium tomato', defaultServingGrams: 120, aliases: ['tomato raw', 'tamatar'] },
  { query: 'onions, raw', category: 'VEGETABLE', defaultServingDescription: '1 medium onion', defaultServingGrams: 110, aliases: ['onion raw', 'pyaz'] },
  { query: 'carrots, raw', category: 'VEGETABLE', defaultServingDescription: '1 medium carrot', defaultServingGrams: 60, aliases: ['carrot raw', 'gajar'] },
  { query: 'cucumber, with peel, raw', category: 'VEGETABLE', defaultServingDescription: '1 medium cucumber', defaultServingGrams: 120, aliases: ['cucumber raw', 'kheera'] },
  { query: 'cabbage, raw', category: 'VEGETABLE', defaultServingDescription: '1 cup shredded', defaultServingGrams: 90, aliases: ['cabbage raw', 'bandh gobi'] },
  { query: 'peas, green, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 160, aliases: ['green peas cooked', 'matar'] },
  { query: 'okra, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['okra boiled', 'bhindi cooked'] },
  { query: 'cauliflower, raw', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 100, aliases: ['gobi'] },
  { query: 'broccoli, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 155, aliases: [] },
  { query: 'peppers, sweet, green, raw', category: 'VEGETABLE', defaultServingDescription: '1 medium pepper', defaultServingGrams: 120, aliases: ['bell pepper', 'shimla mirch', 'capsicum'] },
  { query: 'garlic, raw', category: 'VEGETABLE', defaultServingDescription: '3 cloves', defaultServingGrams: 9, aliases: ['lehsun'] },
  { query: 'ginger root, raw', category: 'VEGETABLE', defaultServingDescription: '1 tbsp', defaultServingGrams: 6, aliases: ['adrak'] },
  { query: 'lettuce, iceberg, raw', category: 'VEGETABLE', defaultServingDescription: '1 cup shredded', defaultServingGrams: 70, aliases: [] },
  { query: 'green beans, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 125, aliases: ['french beans'] },
  { query: 'corn, sweet, yellow, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 165, aliases: ['boiled corn', 'makai'] },
  { query: 'mushrooms, white, raw', category: 'VEGETABLE', defaultServingDescription: '1 cup sliced', defaultServingGrams: 70, aliases: [] },
  { query: 'eggplant, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 cup', defaultServingGrams: 100, aliases: ['baingan boiled'] },
  { query: 'sweet potato, cooked, boiled', category: 'VEGETABLE', defaultServingDescription: '1 medium', defaultServingGrams: 150, aliases: ['shakarkandi'] },

  // Fruits
  { query: 'oranges, raw', category: 'FRUIT', defaultServingDescription: '1 medium orange', defaultServingGrams: 150, aliases: ['orange raw', 'santra'] },
  { query: 'mangos, raw', category: 'FRUIT', defaultServingDescription: '1 medium mango', defaultServingGrams: 200, aliases: ['mango raw', 'aam'] },
  { query: 'grapes, red or green, raw', category: 'FRUIT', defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['grapes raw', 'angoor'] },
  { query: 'watermelon, raw', category: 'FRUIT', defaultServingDescription: '1 cup cubed', defaultServingGrams: 150, aliases: ['watermelon raw', 'tarbooz'] },
  { query: 'pomegranates, raw', category: 'FRUIT', defaultServingDescription: '1 cup arils', defaultServingGrams: 150, aliases: ['pomegranate raw', 'anar'] },
  { query: 'guavas, common, raw', category: 'FRUIT', defaultServingDescription: '1 medium guava', defaultServingGrams: 150, aliases: ['guava raw', 'amrood'] },
  { query: 'dates, medjool', category: 'FRUIT', defaultServingDescription: '3 dates', defaultServingGrams: 30, aliases: ['dates raw', 'khajoor'] },
  { query: 'pineapple, raw', category: 'FRUIT', defaultServingDescription: '1 cup chunks', defaultServingGrams: 165, aliases: ['ananas'] },
  { query: 'strawberries, raw', category: 'FRUIT', defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: [] },
  { query: 'pears, raw', category: 'FRUIT', defaultServingDescription: '1 medium pear', defaultServingGrams: 175, aliases: ['nashpati'] },
  { query: 'peaches, raw', category: 'FRUIT', defaultServingDescription: '1 medium peach', defaultServingGrams: 150, aliases: ['aarhu'] },
  { query: 'avocados, raw', category: 'FRUIT', defaultServingDescription: 'half an avocado', defaultServingGrams: 100, aliases: ['avocado'] },
  { query: 'kiwifruit, raw', category: 'FRUIT', defaultServingDescription: '1 medium kiwi', defaultServingGrams: 75, aliases: ['kiwi'] },
  { query: 'lemon juice, raw', category: 'FRUIT', defaultServingDescription: '1 tbsp', defaultServingGrams: 15, aliases: ['nimbu'] },

  // Dairy
  { query: 'milk, reduced fat, fluid, 2% milkfat', category: 'DAIRY', defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['low fat milk 2 percent'] },
  { query: 'yogurt, greek, plain, whole milk', category: 'DAIRY', defaultServingDescription: '1 cup', defaultServingGrams: 200, aliases: ['greek yogurt plain'] },
  { query: 'cheese, cheddar', category: 'DAIRY', defaultServingDescription: '1 slice', defaultServingGrams: 30, aliases: ['cheddar cheese'] },
  { query: 'cottage cheese, full fat, large or small curd', category: 'DAIRY', defaultServingDescription: '1 cup', defaultServingGrams: 210, aliases: [] },
  { query: 'cream, heavy whipping', category: 'DAIRY', defaultServingDescription: '1 tbsp', defaultServingGrams: 15, aliases: ['heavy cream'] },
  { query: 'butter, salted', category: 'DAIRY', defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['salted butter'] },

  // Fats/oils
  { query: 'oil, olive, salad or cooking', category: 'OTHER', defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['olive oil'] },
  { query: 'oil, canola', category: 'OTHER', defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['canola oil generic'] },

  // Beverages / staples USDA covers well
  { query: 'coffee, brewed, prepared with tap water', category: 'BEVERAGE', defaultServingDescription: '1 cup', defaultServingGrams: 240, aliases: ['black coffee', 'brewed coffee'] },
  { query: 'beverages, orange juice, raw', category: 'BEVERAGE', defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['orange juice'] },
  { query: 'honey', category: 'OTHER', defaultServingDescription: '1 tbsp', defaultServingGrams: 21, aliases: ['shehad'] },
  { query: 'sugars, granulated', category: 'OTHER', defaultServingDescription: '1 tsp', defaultServingGrams: 4, aliases: ['white sugar', 'cheeni'] },
  { query: 'popcorn, air-popped', category: 'SNACK', defaultServingDescription: '1 cup', defaultServingGrams: 8, aliases: ['plain popcorn'] },
];

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

/**
 * USDA returns "Energy" twice per food - once in kJ, once in KCAL - and
 * their order in foodNutrients is not consistent across foods/data types.
 * Picking the first name-only match silently grabbed the kJ figure (~4.2x
 * too high) for many foods; found live in this task (e.g. egg: 649 "kcal"
 * stored, actually 649 kJ / 155 real kcal). preferredUnit pins the lookup
 * to the correct unit when there could be more than one candidate.
 */
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

async function searchUsdaFood(
  apiKey: string,
  query: string,
): Promise<UsdaSearchResultFood | null> {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'Foundation,SR Legacy');
  url.searchParams.set('pageSize', '1');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`USDA search failed for "${query}": ${response.status}`);
  }

  const body = (await response.json()) as UsdaSearchResponse;

  return body.foods[0] ?? null;
}

const STOP_WORDS = new Set(['raw', 'cooked', 'boiled', 'with', 'without', 'and', 'or', 'the', 'a']);

/** Guards against USDA's search occasionally ranking an unrelated food
 * first for a short/generic query (found live: "milk, whole" -> a cheese
 * product; "orange juice, raw" -> "Orange peel, raw"). Not fuzzy matching -
 * requires at least 2 meaningful query words to appear in the result (or
 * all of them, if the query only has 1), so a single incidental shared word
 * like "orange" isn't enough on its own. */
function wordOverlapLooksWrong(query: string, description: string): boolean {
  const queryWords = normalizeFoodText(query)
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const descriptionWords = new Set(normalizeFoodText(description).split(' '));

  if (queryWords.length === 0) {
    return false;
  }

  const overlapCount = queryWords.filter((word) => descriptionWords.has(word)).length;
  const requiredMatches = Math.min(2, queryWords.length);

  return overlapCount < requiredMatches;
}

interface CollisionResolution {
  skip: boolean;
  skipReason?: string;
  excludeAliases: Set<string>;
  supersedeFoodItemIds: string[];
}

/** See file header for the duplicate-avoidance rules this implements. */
async function resolveExistingCollisions(
  prisma: PrismaClient,
  candidateAliasTexts: string[],
): Promise<CollisionResolution> {
  const existing = await prisma.foodAlias.findMany({
    where: { alias: { in: candidateAliasTexts } },
    include: { foodItem: { select: { id: true, source: true, name: true } } },
  });

  if (existing.length === 0) {
    return { skip: false, excludeAliases: new Set(), supersedeFoodItemIds: [] };
  }

  const alreadyUsda = existing.find((row) => row.foodItem.source === FoodSource.USDA);
  if (alreadyUsda) {
    return {
      skip: true,
      skipReason: `already covered by USDA item "${alreadyUsda.foodItem.name}"`,
      excludeAliases: new Set(),
      supersedeFoodItemIds: [],
    };
  }

  const excludeAliases = new Set(
    existing
      .filter(
        (row) =>
          row.foodItem.source === FoodSource.AI_ESTIMATE ||
          row.foodItem.source === FoodSource.FOUNDER_REVIEWED,
      )
      .map((row) => row.alias),
  );
  const supersedeFoodItemIds = Array.from(
    new Set(
      existing
        .filter((row) => row.foodItem.source === FoodSource.PHOENIX_DB)
        .map((row) => row.foodItem.id),
    ),
  );

  return { skip: false, excludeAliases, supersedeFoodItemIds };
}

/**
 * Fixes the 14 live alias collisions this task discovered between the
 * already-imported 10 USDA items and the pre-existing interim PHOENIX_DB
 * pack / Pakistani AI_ESTIMATE pack. Does not alter the 10 USDA FoodItem
 * rows' own name/nutrition data - only resolves which item keeps which
 * shared alias, per the same rules as resolveExistingCollisions() above.
 * Three of the ten (milk->cheese, apple->rose-apple, chicken breast->
 * breaded tenders) were wrong-species top-search-result matches; their
 * colliding alias is kept on the correct PHOENIX_DB item instead of being
 * removed from it, since giving that alias to the wrong food would make the
 * matcher return incorrect nutrition data.
 */
async function fixPreExistingCollisions(prisma: PrismaClient): Promise<void> {
  const sameFoodSupersedes = [
    { usdaName: 'Egg, whole, cooked, hard-boiled', phoenixName: 'Egg (boiled)' },
    { usdaName: 'Yogurt, plain, nonfat', phoenixName: 'Yogurt (plain)' },
    { usdaName: 'Bread, pita, whole-wheat', phoenixName: 'Whole Wheat Bread' },
    { usdaName: 'Potatoes, boiled, cooked in skin, flesh, with salt', phoenixName: 'Potato (boiled)' },
    { usdaName: 'Malabar spinach, cooked', phoenixName: 'Spinach (cooked)' },
    { usdaName: 'Bananas, raw', phoenixName: 'Banana' },
  ];
  // Not wrong-species matches - these are correct foods, but the colliding
  // alias belongs to a Pakistani/restaurant pack (AI_ESTIMATE) item, which
  // takes priority for its own terms per resolveExistingCollisions()'s
  // rules. "Plain White Rice (cooked)" is part of that pack (not the
  // interim PHOENIX_DB generics pack as originally assumed), so its aliases
  // stay there instead of being superseded.
  const wrongMatchAliasesToRestore = [
    { usdaName: 'Cheese, mozzarella, whole milk', alias: 'doodh' },
    { usdaName: 'Rose-apples, raw', alias: 'seb' },
    { usdaName: 'Chicken breast tenders, breaded, cooked, microwaved', alias: 'grilled chicken breast' },
    { usdaName: 'Rice, white, glutinous, unenriched, cooked', alias: 'boiled rice' },
    { usdaName: 'Rice, white, glutinous, unenriched, cooked', alias: 'chawal' },
  ];

  for (const pair of sameFoodSupersedes) {
    const [usdaItem, phoenixItem] = await Promise.all([
      prisma.foodItem.findFirst({
        where: { name: pair.usdaName },
        include: { aliases: true },
      }),
      prisma.foodItem.findFirst({
        where: { name: pair.phoenixName, source: FoodSource.PHOENIX_DB },
        include: { aliases: true },
      }),
    ]);

    if (!usdaItem || !phoenixItem) {
      continue;
    }

    const existingAliasTexts = new Set(usdaItem.aliases.map((a) => a.alias));
    const aliasesToMigrate = phoenixItem.aliases
      .map((a) => a.alias)
      .filter((alias) => !existingAliasTexts.has(alias));

    if (aliasesToMigrate.length > 0) {
      await prisma.foodAlias.createMany({
        data: aliasesToMigrate.map((alias) => ({
          foodItemId: usdaItem.id,
          alias,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.foodItem.delete({ where: { id: phoenixItem.id } });
    console.log(
      `Superseded interim "${phoenixItem.name}" with USDA "${usdaItem.name}"` +
        (aliasesToMigrate.length > 0 ? ` (migrated: ${aliasesToMigrate.join(', ')})` : ''),
    );
  }

  for (const fix of wrongMatchAliasesToRestore) {
    const wrongItem = await prisma.foodItem.findFirst({
      where: { name: fix.usdaName },
    });

    if (!wrongItem) {
      continue;
    }

    await prisma.foodAlias.deleteMany({
      where: { foodItemId: wrongItem.id, alias: fix.alias },
    });
    console.log(
      `Removed mismatched alias "${fix.alias}" from wrong-species USDA match "${wrongItem.name}" (kept on the correct Phoenix DB item).`,
    );
  }
}

interface ImportSummary {
  imported: number;
  skippedDuplicate: number;
  skippedNoMatch: number;
  skippedWrongMatch: number;
  errored: number;
}

async function main(): Promise<void> {
  const apiKey = process.env.USDA_API_KEY;

  if (!apiKey) {
    throw new Error(
      'USDA_API_KEY is required. Get a free key at https://fdc.nal.usda.gov/api-key-signup.html ' +
        'and set it in backend/.env before running this script.',
    );
  }

  const prisma = new PrismaClient();
  const summary: ImportSummary = {
    imported: 0,
    skippedDuplicate: 0,
    skippedNoMatch: 0,
    skippedWrongMatch: 0,
    errored: 0,
  };

  try {
    await fixPreExistingCollisions(prisma);

    for (const target of usdaSearchTargets) {
     try {
      const targetAliasTexts = target.aliases
        .map((alias) => normalizeFoodText(alias))
        .filter((alias) => alias.length > 0);
      const preCheck = await resolveExistingCollisions(prisma, targetAliasTexts);

      if (preCheck.skip) {
        console.log(`Skipping "${target.query}": ${preCheck.skipReason}`);
        summary.skippedDuplicate += 1;
        continue;
      }

      await sleep(REQUEST_DELAY_MS);
      const food = await searchUsdaFood(apiKey, target.query);

      if (!food) {
        console.warn(`No USDA match for "${target.query}", skipping.`);
        summary.skippedNoMatch += 1;
        continue;
      }

      if (wordOverlapLooksWrong(target.query, food.description)) {
        console.warn(
          `USDA top result "${food.description}" looks unrelated to "${target.query}", skipping.`,
        );
        summary.skippedWrongMatch += 1;
        continue;
      }

      const selfAlias = normalizeFoodText(food.description);
      const selfAliasCheck = await resolveExistingCollisions(
        prisma,
        selfAlias ? [selfAlias] : [],
      );

      if (selfAliasCheck.skip) {
        console.log(`Skipping "${food.description}": ${selfAliasCheck.skipReason}`);
        summary.skippedDuplicate += 1;
        continue;
      }

      const supersedeIds = Array.from(
        new Set([...preCheck.supersedeFoodItemIds, ...selfAliasCheck.supersedeFoodItemIds]),
      );
      const excludeAliases = new Set([
        ...preCheck.excludeAliases,
        ...selfAliasCheck.excludeAliases,
      ]);

      const aliasTexts = new Set<string>();
      if (selfAlias && !excludeAliases.has(selfAlias)) {
        aliasTexts.add(selfAlias);
      }
      for (const alias of targetAliasTexts) {
        if (!excludeAliases.has(alias)) {
          aliasTexts.add(alias);
        }
      }

      if (supersedeIds.length > 0) {
        const superseded = await prisma.foodItem.findMany({
          where: { id: { in: supersedeIds } },
          include: { aliases: true },
        });
        for (const item of superseded) {
          for (const alias of item.aliases) {
            if (!excludeAliases.has(alias.alias)) {
              aliasTexts.add(alias.alias);
            }
          }
        }
      }

      const caloriesPer100g = extractNutrient(food.foodNutrients, 'Energy', 'KCAL');
      const proteinPer100g = extractNutrient(food.foodNutrients, 'Protein');
      const carbsPer100g = extractNutrient(food.foodNutrients, 'Carbohydrate');
      const fatPer100g = extractNutrient(food.foodNutrients, 'total lipid');

      await prisma.$transaction(async (transaction) => {
        if (supersedeIds.length > 0) {
          await transaction.foodItem.deleteMany({
            where: { id: { in: supersedeIds } },
          });
        }

        await transaction.foodItem.create({
          data: {
            name: food.description,
            category: target.category,
            caloriesPer100g,
            proteinPer100g,
            carbsPer100g,
            fatPer100g,
            defaultServingDescription: target.defaultServingDescription,
            defaultServingGrams: target.defaultServingGrams,
            confidence: 'HIGH',
            source: 'USDA',
            verified: true,
            aliases: {
              create: Array.from(aliasTexts).map((alias) => ({ alias })),
            },
          },
        });
      });

      summary.imported += 1;
      console.log(
        `Imported USDA food: ${food.description}` +
          (supersedeIds.length > 0 ? ' (superseded an interim Phoenix DB entry)' : ''),
      );
     } catch (error) {
       // One bad query/response must not abort the rest of the run.
       summary.errored += 1;
       console.error(`Error importing "${target.query}":`, error);
     }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\nDone. Imported: ${summary.imported}, skipped as duplicate/covered: ${summary.skippedDuplicate}, ` +
      `no USDA match: ${summary.skippedNoMatch}, wrong-match guard triggered: ${summary.skippedWrongMatch}, ` +
      `errored: ${summary.errored}.`,
  );
}

main().catch((error) => {
  console.error('USDA import failed:', error);
  process.exitCode = 1;
});
