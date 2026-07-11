import { FoodCategory } from '@prisma/client';

export interface FoodSeedEntry {
  name: string;
  category: FoodCategory;
  /** Per 100g, matching FoodItem's schema. */
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g?: number;
  fatPer100g?: number;
  defaultServingDescription: string;
  defaultServingGrams: number;
  aliases: string[];
}

// Pakistani/South Asian and restaurant foods. AI-drafted starting estimates
// (source: AI_ESTIMATE, verified: false) - the same "seed as DRAFT, founder
// approves later" pattern already used for RAG content. Per-100g figures are
// derived from the portion-based ranges in
// backend/prisma/seed-rag-content.ts's "Pakistani Everyday Foods" document
// for consistency between the RAG coaching knowledge and the Food DB.
export const pakistaniFoodPack: FoodSeedEntry[] = [
  { name: 'Chicken Biryani', category: 'MAIN_DISH', caloriesPer100g: 165, proteinPer100g: 8, carbsPer100g: 18, fatPer100g: 6.5, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: ['biryani chicken', 'murgh biryani', 'chicken biryani rice'] },
  { name: 'Beef Biryani', category: 'MAIN_DISH', caloriesPer100g: 175, proteinPer100g: 9, carbsPer100g: 17, fatPer100g: 7.5, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: ['beef biryani rice', 'gosht biryani'] },
  { name: 'Mutton Biryani', category: 'MAIN_DISH', caloriesPer100g: 185, proteinPer100g: 9, carbsPer100g: 17, fatPer100g: 8.5, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: ['mutton biryani rice'] },
  { name: 'Vegetable Biryani', category: 'MAIN_DISH', caloriesPer100g: 140, proteinPer100g: 4, carbsPer100g: 22, fatPer100g: 4.5, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: ['veg biryani', 'sabzi biryani'] },
  { name: 'Chicken Pulao', category: 'MAIN_DISH', caloriesPer100g: 155, proteinPer100g: 7, carbsPer100g: 19, fatPer100g: 5.5, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: ['chicken pilaf', 'yakhni pulao'] },
  { name: 'Chicken Karahi', category: 'MAIN_DISH', caloriesPer100g: 190, proteinPer100g: 16, carbsPer100g: 5, fatPer100g: 12, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['chicken kadai', 'karahi chicken', 'murgh karahi'] },
  { name: 'Mutton Karahi', category: 'MAIN_DISH', caloriesPer100g: 220, proteinPer100g: 17, carbsPer100g: 4, fatPer100g: 15, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['mutton kadai', 'karahi gosht'] },
  { name: 'Nihari', category: 'MAIN_DISH', caloriesPer100g: 200, proteinPer100g: 14, carbsPer100g: 6, fatPer100g: 13, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['beef nihari', 'nihari gosht'] },
  { name: 'Haleem', category: 'MAIN_DISH', caloriesPer100g: 160, proteinPer100g: 9, carbsPer100g: 14, fatPer100g: 7, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['chicken haleem', 'daleem'] },
  { name: 'Chicken Qorma', category: 'MAIN_DISH', caloriesPer100g: 185, proteinPer100g: 13, carbsPer100g: 6, fatPer100g: 12, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['chicken korma', 'murgh qorma'] },
  { name: 'Chicken Salan', category: 'MAIN_DISH', caloriesPer100g: 105, proteinPer100g: 9, carbsPer100g: 3, fatPer100g: 6.5, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['chicken curry', 'chicken saalan', 'murgh salan'] },
  { name: 'Beef Salan', category: 'MAIN_DISH', caloriesPer100g: 120, proteinPer100g: 10, carbsPer100g: 3, fatPer100g: 8, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['beef curry', 'gosht salan'] },
  { name: 'Aloo Gosht', category: 'MAIN_DISH', caloriesPer100g: 130, proteinPer100g: 8, carbsPer100g: 8, fatPer100g: 7, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['potato meat curry', 'aloo gosht curry'] },
  { name: 'Palak Gosht', category: 'MAIN_DISH', caloriesPer100g: 120, proteinPer100g: 9, carbsPer100g: 5, fatPer100g: 7, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['spinach meat curry', 'saag gosht'] },
  { name: 'Chicken Tikka', category: 'PROTEIN', caloriesPer100g: 190, proteinPer100g: 24, carbsPer100g: 2, fatPer100g: 9, defaultServingDescription: '4 pieces', defaultServingGrams: 200, aliases: ['chicken tikka piece', 'murgh tikka'] },
  { name: 'Seekh Kebab', category: 'PROTEIN', caloriesPer100g: 230, proteinPer100g: 18, carbsPer100g: 3, fatPer100g: 16, defaultServingDescription: '2 skewers', defaultServingGrams: 150, aliases: ['seekh kabab', 'beef seekh kebab'] },
  { name: 'Chapli Kebab', category: 'PROTEIN', caloriesPer100g: 260, proteinPer100g: 17, carbsPer100g: 6, fatPer100g: 19, defaultServingDescription: '1 piece', defaultServingGrams: 120, aliases: ['chapli kabab'] },
  { name: 'Shami Kebab', category: 'PROTEIN', caloriesPer100g: 210, proteinPer100g: 14, carbsPer100g: 10, fatPer100g: 13, defaultServingDescription: '2 pieces', defaultServingGrams: 120, aliases: ['shami kabab'] },
  { name: 'Tandoori Chicken', category: 'PROTEIN', caloriesPer100g: 175, proteinPer100g: 25, carbsPer100g: 1, fatPer100g: 8, defaultServingDescription: '1 leg piece', defaultServingGrams: 150, aliases: ['tandoori murgh'] },
  { name: 'Chicken Malai Boti', category: 'PROTEIN', caloriesPer100g: 220, proteinPer100g: 22, carbsPer100g: 2, fatPer100g: 14, defaultServingDescription: '4 pieces', defaultServingGrams: 200, aliases: ['malai boti'] },
  { name: 'Daal Chawal', category: 'MAIN_DISH', caloriesPer100g: 130, proteinPer100g: 5, carbsPer100g: 22, fatPer100g: 2.5, defaultServingDescription: '1 bowl daal + 1 cup rice', defaultServingGrams: 400, aliases: ['dal chawal', 'daal rice', 'lentils and rice'] },
  { name: 'Daal Masoor', category: 'MAIN_DISH', caloriesPer100g: 90, proteinPer100g: 6, carbsPer100g: 13, fatPer100g: 2, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['masoor daal', 'red lentil curry'] },
  { name: 'Daal Chana', category: 'MAIN_DISH', caloriesPer100g: 100, proteinPer100g: 6.5, carbsPer100g: 15, fatPer100g: 2.5, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['chana daal', 'split chickpea curry'] },
  { name: 'Daal Moong', category: 'MAIN_DISH', caloriesPer100g: 85, proteinPer100g: 6, carbsPer100g: 12, fatPer100g: 2, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['moong daal', 'mung dal'] },
  { name: 'Chana Masala', category: 'MAIN_DISH', caloriesPer100g: 130, proteinPer100g: 6, carbsPer100g: 18, fatPer100g: 4, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['chole', 'chickpea curry'] },
  { name: 'Rajma', category: 'MAIN_DISH', caloriesPer100g: 120, proteinPer100g: 7, carbsPer100g: 18, fatPer100g: 2.5, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['kidney bean curry'] },
  { name: 'Aloo Sabzi', category: 'VEGETABLE', caloriesPer100g: 110, proteinPer100g: 2, carbsPer100g: 15, fatPer100g: 5, defaultServingDescription: '1 serving', defaultServingGrams: 200, aliases: ['potato curry', 'aloo bhujia'] },
  { name: 'Bhindi Masala', category: 'VEGETABLE', caloriesPer100g: 95, proteinPer100g: 2, carbsPer100g: 8, fatPer100g: 6, defaultServingDescription: '1 serving', defaultServingGrams: 200, aliases: ['okra curry', 'bhindi fry'] },
  { name: 'Baingan Bharta', category: 'VEGETABLE', caloriesPer100g: 90, proteinPer100g: 2, carbsPer100g: 8, fatPer100g: 5.5, defaultServingDescription: '1 serving', defaultServingGrams: 200, aliases: ['eggplant curry', 'baingan ka bharta'] },
  { name: 'Mixed Vegetable Curry', category: 'VEGETABLE', caloriesPer100g: 85, proteinPer100g: 2.5, carbsPer100g: 9, fatPer100g: 4.5, defaultServingDescription: '1 serving', defaultServingGrams: 200, aliases: ['mix sabzi', 'mixed sabzi'] },
  { name: 'Roti', category: 'BREAD', caloriesPer100g: 280, proteinPer100g: 9, carbsPer100g: 52, fatPer100g: 4, defaultServingDescription: '1 medium roti', defaultServingGrams: 40, aliases: ['chapati', 'tandoori roti', 'phulka'] },
  { name: 'Naan', category: 'BREAD', caloriesPer100g: 290, proteinPer100g: 8, carbsPer100g: 50, fatPer100g: 6, defaultServingDescription: '1 piece', defaultServingGrams: 90, aliases: ['plain naan', 'tandoori naan'] },
  { name: 'Butter Naan', category: 'BREAD', caloriesPer100g: 330, proteinPer100g: 8, carbsPer100g: 48, fatPer100g: 11, defaultServingDescription: '1 piece', defaultServingGrams: 90, aliases: [] },
  { name: 'Paratha', category: 'BREAD', caloriesPer100g: 330, proteinPer100g: 7, carbsPer100g: 45, fatPer100g: 14, defaultServingDescription: '1 medium paratha', defaultServingGrams: 90, aliases: ['plain paratha'] },
  { name: 'Aloo Paratha', category: 'BREAD', caloriesPer100g: 300, proteinPer100g: 6, carbsPer100g: 42, fatPer100g: 12, defaultServingDescription: '1 stuffed paratha', defaultServingGrams: 140, aliases: ['potato paratha', 'stuffed aloo paratha'] },
  { name: 'Keema Paratha', category: 'BREAD', caloriesPer100g: 320, proteinPer100g: 11, carbsPer100g: 34, fatPer100g: 15, defaultServingDescription: '1 stuffed paratha', defaultServingGrams: 140, aliases: ['mince paratha'] },
  { name: 'Puri', category: 'BREAD', caloriesPer100g: 380, proteinPer100g: 7, carbsPer100g: 40, fatPer100g: 22, defaultServingDescription: '2 pieces', defaultServingGrams: 60, aliases: ['poori', 'fried bread'] },
  { name: 'Plain White Rice (cooked)', category: 'MAIN_DISH', caloriesPer100g: 130, proteinPer100g: 2.5, carbsPer100g: 28, fatPer100g: 0.3, defaultServingDescription: '1 cup', defaultServingGrams: 180, aliases: ['boiled rice', 'chawal', 'steamed rice'] },
  { name: 'Chicken Sandwich', category: 'MAIN_DISH', caloriesPer100g: 230, proteinPer100g: 13, carbsPer100g: 22, fatPer100g: 9, defaultServingDescription: '1 sandwich', defaultServingGrams: 180, aliases: [] },
  { name: 'Chicken Shawarma', category: 'MAIN_DISH', caloriesPer100g: 220, proteinPer100g: 15, carbsPer100g: 20, fatPer100g: 9, defaultServingDescription: '1 roll', defaultServingGrams: 250, aliases: ['shawarma roll', 'chicken shwarma'] },
  { name: 'Beef Burger', category: 'MAIN_DISH', caloriesPer100g: 260, proteinPer100g: 13, carbsPer100g: 22, fatPer100g: 14, defaultServingDescription: '1 regular burger', defaultServingGrams: 220, aliases: [] },
  { name: 'Zinger Burger', category: 'MAIN_DISH', caloriesPer100g: 270, proteinPer100g: 13, carbsPer100g: 25, fatPer100g: 14, defaultServingDescription: '1 regular burger', defaultServingGrams: 240, aliases: ['crispy chicken burger'] },
  { name: 'Chicken Broast', category: 'PROTEIN', caloriesPer100g: 290, proteinPer100g: 20, carbsPer100g: 12, fatPer100g: 18, defaultServingDescription: '2 pieces', defaultServingGrams: 250, aliases: ['fried chicken', 'kfc style chicken'] },
  { name: 'French Fries', category: 'SNACK', caloriesPer100g: 315, proteinPer100g: 3.5, carbsPer100g: 41, fatPer100g: 15, defaultServingDescription: '1 regular serving', defaultServingGrams: 115, aliases: ['fries', 'chips'] },
  { name: 'Chicken Roll', category: 'SNACK', caloriesPer100g: 240, proteinPer100g: 12, carbsPer100g: 24, fatPer100g: 11, defaultServingDescription: '1 roll', defaultServingGrams: 200, aliases: ['chicken paratha roll'] },
  { name: 'Samosa', category: 'SNACK', caloriesPer100g: 310, proteinPer100g: 5, carbsPer100g: 32, fatPer100g: 18, defaultServingDescription: '1 piece', defaultServingGrams: 90, aliases: ['vegetable samosa', 'aloo samosa'] },
  { name: 'Pakora', category: 'SNACK', caloriesPer100g: 320, proteinPer100g: 8, carbsPer100g: 28, fatPer100g: 20, defaultServingDescription: '1 plate', defaultServingGrams: 100, aliases: ['pakoray', 'onion pakora'] },
  { name: 'Spring Roll', category: 'SNACK', caloriesPer100g: 260, proteinPer100g: 5, carbsPer100g: 30, fatPer100g: 13, defaultServingDescription: '2 pieces', defaultServingGrams: 100, aliases: [] },
  { name: 'Chicken Corn Soup', category: 'MAIN_DISH', caloriesPer100g: 60, proteinPer100g: 4, carbsPer100g: 8, fatPer100g: 1.5, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['corn soup'] },
  { name: 'Hot and Sour Soup', category: 'MAIN_DISH', caloriesPer100g: 45, proteinPer100g: 3, carbsPer100g: 5, fatPer100g: 1.5, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: [] },
  { name: 'Chicken Fried Rice', category: 'MAIN_DISH', caloriesPer100g: 175, proteinPer100g: 7, carbsPer100g: 22, fatPer100g: 6.5, defaultServingDescription: '1 plate', defaultServingGrams: 350, aliases: ['fried rice chicken'] },
  { name: 'Chicken Chow Mein', category: 'MAIN_DISH', caloriesPer100g: 165, proteinPer100g: 7, carbsPer100g: 21, fatPer100g: 6, defaultServingDescription: '1 plate', defaultServingGrams: 350, aliases: ['chowmein', 'chicken noodles'] },
  { name: 'Chai', category: 'BEVERAGE', caloriesPer100g: 55, proteinPer100g: 1.5, carbsPer100g: 7, fatPer100g: 2, defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['doodh patti', 'milk tea', 'karak chai', 'pakistani tea'] },
  { name: 'Green Tea', category: 'BEVERAGE', caloriesPer100g: 1, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0, defaultServingDescription: '1 cup', defaultServingGrams: 240, aliases: ['sabz chai'] },
  { name: 'Lassi', category: 'BEVERAGE', caloriesPer100g: 90, proteinPer100g: 3, carbsPer100g: 9, fatPer100g: 4.5, defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['sweet lassi', 'salted lassi'] },
  { name: 'Fresh Lime Soda', category: 'BEVERAGE', caloriesPer100g: 35, proteinPer100g: 0, carbsPer100g: 9, fatPer100g: 0, defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['nimbu soda', 'lemon soda'] },
  { name: 'Sugarcane Juice', category: 'BEVERAGE', caloriesPer100g: 40, proteinPer100g: 0, carbsPer100g: 10, fatPer100g: 0, defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['ganne ka ras'] },
  { name: 'Mango Shake', category: 'BEVERAGE', caloriesPer100g: 95, proteinPer100g: 2, carbsPer100g: 17, fatPer100g: 2, defaultServingDescription: '1 glass', defaultServingGrams: 300, aliases: ['mango milkshake'] },
  { name: 'Cola (regular)', category: 'BEVERAGE', caloriesPer100g: 42, proteinPer100g: 0, carbsPer100g: 10.5, fatPer100g: 0, defaultServingDescription: '1 can', defaultServingGrams: 330, aliases: ['soft drink', 'pepsi', 'coke'] },
  { name: 'Gulab Jamun', category: 'SNACK', caloriesPer100g: 330, proteinPer100g: 4, carbsPer100g: 50, fatPer100g: 13, defaultServingDescription: '1 piece', defaultServingGrams: 40, aliases: [] },
  { name: 'Jalebi', category: 'SNACK', caloriesPer100g: 380, proteinPer100g: 2, carbsPer100g: 60, fatPer100g: 15, defaultServingDescription: '2 pieces', defaultServingGrams: 60, aliases: [] },
  { name: 'Kheer', category: 'SNACK', caloriesPer100g: 130, proteinPer100g: 3, carbsPer100g: 20, fatPer100g: 4, defaultServingDescription: '1 bowl', defaultServingGrams: 150, aliases: ['rice pudding'] },
  { name: 'Ras Malai', category: 'SNACK', caloriesPer100g: 200, proteinPer100g: 6, carbsPer100g: 22, fatPer100g: 9, defaultServingDescription: '2 pieces', defaultServingGrams: 100, aliases: ['rasmalai'] },
  { name: 'Barfi', category: 'SNACK', caloriesPer100g: 420, proteinPer100g: 6, carbsPer100g: 50, fatPer100g: 22, defaultServingDescription: '2 pieces', defaultServingGrams: 50, aliases: [] },
  { name: 'Fruit Chaat', category: 'FRUIT', caloriesPer100g: 65, proteinPer100g: 1, carbsPer100g: 15, fatPer100g: 0.3, defaultServingDescription: '1 bowl', defaultServingGrams: 200, aliases: ['fruit salad chaat'] },
  { name: 'Dahi Bhalla', category: 'SNACK', caloriesPer100g: 140, proteinPer100g: 5, carbsPer100g: 16, fatPer100g: 6, defaultServingDescription: '1 plate', defaultServingGrams: 150, aliases: ['dahi vada'] },
  { name: 'Sindhi Biryani', category: 'MAIN_DISH', caloriesPer100g: 170, proteinPer100g: 8, carbsPer100g: 18, fatPer100g: 7, defaultServingDescription: '1 medium plate', defaultServingGrams: 400, aliases: [] },
  { name: 'Chicken White Karahi', category: 'MAIN_DISH', caloriesPer100g: 175, proteinPer100g: 16, carbsPer100g: 4, fatPer100g: 11, defaultServingDescription: '1 bowl', defaultServingGrams: 300, aliases: ['white karahi'] },
];

// Common generic/global foods intended to be USDA-sourced (D-072). No
// USDA_API_KEY was available in this environment/session (see report), so
// these are seeded now as an interim PHOENIX_DB pack with realistic, widely
// established nutrition figures, verified: false. Running
// `npm run seed:usda` later with a real key will upsert these same names
// with source: USDA, verified: true, overwriting the interim numbers.
export const genericFoodPack: FoodSeedEntry[] = [
  { name: 'Egg (boiled)', category: 'PROTEIN', caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, defaultServingDescription: '1 egg', defaultServingGrams: 50, aliases: ['boiled egg', 'anda'] },
  { name: 'Egg (fried)', category: 'PROTEIN', caloriesPer100g: 195, proteinPer100g: 14, carbsPer100g: 0.8, fatPer100g: 15, defaultServingDescription: '1 egg', defaultServingGrams: 55, aliases: ['fried egg'] },
  { name: 'Egg Omelette', category: 'PROTEIN', caloriesPer100g: 175, proteinPer100g: 12, carbsPer100g: 2, fatPer100g: 13, defaultServingDescription: '2-egg omelette', defaultServingGrams: 120, aliases: ['omelette', 'omelet'] },
  { name: 'Chicken Breast (cooked, skinless)', category: 'PROTEIN', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, defaultServingDescription: '1 palm-sized piece', defaultServingGrams: 100, aliases: ['grilled chicken breast', 'boneless chicken', 'chicken breast'] },
  { name: 'Chicken Thigh (cooked)', category: 'PROTEIN', caloriesPer100g: 210, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 11, defaultServingDescription: '1 piece', defaultServingGrams: 100, aliases: ['chicken leg piece'] },
  { name: 'Beef (cooked, lean)', category: 'PROTEIN', caloriesPer100g: 250, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 15, defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['beef meat', 'gosht beef'] },
  { name: 'Mutton (cooked)', category: 'PROTEIN', caloriesPer100g: 294, proteinPer100g: 25, carbsPer100g: 0, fatPer100g: 21, defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['lamb meat', 'goat meat'] },
  { name: 'Fish (grilled, generic)', category: 'PROTEIN', caloriesPer100g: 140, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 4.5, defaultServingDescription: '1 fillet', defaultServingGrams: 120, aliases: ['grilled fish', 'fish fillet'] },
  { name: 'Salmon (cooked)', category: 'PROTEIN', caloriesPer100g: 208, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 13, defaultServingDescription: '1 fillet', defaultServingGrams: 120, aliases: [] },
  { name: 'Shrimp (cooked)', category: 'PROTEIN', caloriesPer100g: 99, proteinPer100g: 24, carbsPer100g: 0.2, fatPer100g: 0.3, defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['prawns'] },
  { name: 'Milk (whole)', category: 'DAIRY', caloriesPer100g: 61, proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 3.3, defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['doodh', 'full cream milk'] },
  { name: 'Milk (skim)', category: 'DAIRY', caloriesPer100g: 34, proteinPer100g: 3.4, carbsPer100g: 5, fatPer100g: 0.1, defaultServingDescription: '1 glass', defaultServingGrams: 250, aliases: ['low fat milk', 'skimmed milk'] },
  { name: 'Yogurt (plain)', category: 'DAIRY', caloriesPer100g: 61, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, defaultServingDescription: '1 cup', defaultServingGrams: 200, aliases: ['dahi', 'curd'] },
  { name: 'Greek Yogurt (plain)', category: 'DAIRY', caloriesPer100g: 59, proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, defaultServingDescription: '1 cup', defaultServingGrams: 200, aliases: [] },
  { name: 'Cheese (cheddar)', category: 'DAIRY', caloriesPer100g: 403, proteinPer100g: 25, carbsPer100g: 1.3, fatPer100g: 33, defaultServingDescription: '1 slice', defaultServingGrams: 30, aliases: [] },
  { name: 'Paneer', category: 'DAIRY', caloriesPer100g: 265, proteinPer100g: 18, carbsPer100g: 3.6, fatPer100g: 20, defaultServingDescription: '100g serving', defaultServingGrams: 100, aliases: ['cottage cheese'] },
  { name: 'Butter', category: 'DAIRY', caloriesPer100g: 717, proteinPer100g: 0.9, carbsPer100g: 0.1, fatPer100g: 81, defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['makhan'] },
  { name: 'Ghee', category: 'OTHER', caloriesPer100g: 900, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['clarified butter'] },
  { name: 'Cooking Oil (vegetable)', category: 'OTHER', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, defaultServingDescription: '1 tbsp', defaultServingGrams: 14, aliases: ['cooking oil', 'canola oil'] },
  { name: 'Rice (raw, uncooked)', category: 'MAIN_DISH', caloriesPer100g: 365, proteinPer100g: 7, carbsPer100g: 80, fatPer100g: 0.7, defaultServingDescription: '1 cup raw', defaultServingGrams: 190, aliases: ['uncooked rice'] },
  { name: 'Brown Rice (cooked)', category: 'MAIN_DISH', caloriesPer100g: 123, proteinPer100g: 2.7, carbsPer100g: 26, fatPer100g: 1, defaultServingDescription: '1 cup', defaultServingGrams: 180, aliases: [] },
  { name: 'Whole Wheat Bread', category: 'BREAD', caloriesPer100g: 250, proteinPer100g: 9, carbsPer100g: 41, fatPer100g: 4.2, defaultServingDescription: '1 slice', defaultServingGrams: 30, aliases: ['brown bread'] },
  { name: 'White Bread', category: 'BREAD', caloriesPer100g: 265, proteinPer100g: 9, carbsPer100g: 49, fatPer100g: 3.2, defaultServingDescription: '1 slice', defaultServingGrams: 30, aliases: [] },
  // 'cooked oats' is an explicit alias (not left to the containment tier)
  // so a qualified phrase like "100g cooked oats" reliably wins an EXACT
  // match here instead of containment-matching the new bare "oats" alias
  // below (found live: without this, "cooked oats" incorrectly matched the
  // raw entry, since "oats" alone is a shorter, more eagerly-matching
  // containment hit than the 3-word self-alias "oats cooked plain").
  { name: 'Oats (cooked, plain)', category: 'MAIN_DISH', caloriesPer100g: 68, proteinPer100g: 2.4, carbsPer100g: 12, fatPer100g: 1.4, defaultServingDescription: '1 bowl', defaultServingGrams: 200, aliases: ['oatmeal', 'porridge', 'cooked oats'] },
  // "oats" (bare, unqualified) is intentionally routed HERE, not to the
  // cooked entry above: when a user states a specific gram quantity for
  // "oats" (e.g. "100gm oats"), that is almost always the dry/raw weight
  // measured before cooking - the common real-world convention - not the
  // cooked/bulked-up weight. Matches USDA "Oats, raw" per-100g figures.
  // "oatmeal"/"porridge" stay on the cooked entry above deliberately: both
  // denote the prepared breakfast dish in this app's usage (porridge in
  // particular cannot be raw by definition), so splitting the near-synonym
  // pair across two entries would be inconsistent - see
  // docs/16_Claude_Code_Handover.md for the full note on this fix.
  { name: 'Oats (raw, dry)', category: 'MAIN_DISH', caloriesPer100g: 389, proteinPer100g: 16.9, carbsPer100g: 66.3, fatPer100g: 6.9, defaultServingDescription: '1 cup dry', defaultServingGrams: 80, aliases: ['oats', 'dry oats', 'rolled oats', 'raw oats'] },
  { name: 'Cornflakes (with milk)', category: 'MAIN_DISH', caloriesPer100g: 130, proteinPer100g: 4, carbsPer100g: 22, fatPer100g: 2.5, defaultServingDescription: '1 bowl', defaultServingGrams: 250, aliases: ['cereal'] },
  { name: 'Potato (boiled)', category: 'VEGETABLE', caloriesPer100g: 87, proteinPer100g: 1.9, carbsPer100g: 20, fatPer100g: 0.1, defaultServingDescription: '1 medium potato', defaultServingGrams: 150, aliases: ['aloo', 'boiled potato'] },
  { name: 'Onion (raw)', category: 'VEGETABLE', caloriesPer100g: 40, proteinPer100g: 1.1, carbsPer100g: 9.3, fatPer100g: 0.1, defaultServingDescription: '1 medium onion', defaultServingGrams: 110, aliases: ['pyaz'] },
  { name: 'Tomato (raw)', category: 'VEGETABLE', caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 3.9, fatPer100g: 0.2, defaultServingDescription: '1 medium tomato', defaultServingGrams: 120, aliases: ['tamatar'] },
  { name: 'Spinach (cooked)', category: 'VEGETABLE', caloriesPer100g: 23, proteinPer100g: 2.9, carbsPer100g: 3.6, fatPer100g: 0.4, defaultServingDescription: '1 cup', defaultServingGrams: 180, aliases: ['saag', 'palak'] },
  { name: 'Carrot (raw)', category: 'VEGETABLE', caloriesPer100g: 41, proteinPer100g: 0.9, carbsPer100g: 10, fatPer100g: 0.2, defaultServingDescription: '1 medium carrot', defaultServingGrams: 60, aliases: ['gajar'] },
  { name: 'Cucumber (raw)', category: 'VEGETABLE', caloriesPer100g: 15, proteinPer100g: 0.7, carbsPer100g: 3.6, fatPer100g: 0.1, defaultServingDescription: '1 medium cucumber', defaultServingGrams: 120, aliases: ['kheera'] },
  { name: 'Cabbage (cooked)', category: 'VEGETABLE', caloriesPer100g: 23, proteinPer100g: 1.3, carbsPer100g: 5.4, fatPer100g: 0.1, defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['bandh gobi'] },
  { name: 'Green Peas (cooked)', category: 'VEGETABLE', caloriesPer100g: 84, proteinPer100g: 5.4, carbsPer100g: 15, fatPer100g: 0.4, defaultServingDescription: '1 cup', defaultServingGrams: 160, aliases: ['matar'] },
  { name: 'Okra (cooked)', category: 'VEGETABLE', caloriesPer100g: 33, proteinPer100g: 2, carbsPer100g: 7, fatPer100g: 0.2, defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['bhindi'] },
  { name: 'Apple', category: 'FRUIT', caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 14, fatPer100g: 0.2, defaultServingDescription: '1 medium apple', defaultServingGrams: 180, aliases: ['seb'] },
  { name: 'Banana', category: 'FRUIT', caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 23, fatPer100g: 0.3, defaultServingDescription: '1 medium banana', defaultServingGrams: 120, aliases: ['kela'] },
  { name: 'Orange', category: 'FRUIT', caloriesPer100g: 47, proteinPer100g: 0.9, carbsPer100g: 12, fatPer100g: 0.1, defaultServingDescription: '1 medium orange', defaultServingGrams: 150, aliases: ['santra'] },
  { name: 'Mango', category: 'FRUIT', caloriesPer100g: 60, proteinPer100g: 0.8, carbsPer100g: 15, fatPer100g: 0.4, defaultServingDescription: '1 medium mango', defaultServingGrams: 200, aliases: ['aam'] },
  { name: 'Grapes', category: 'FRUIT', caloriesPer100g: 69, proteinPer100g: 0.7, carbsPer100g: 18, fatPer100g: 0.2, defaultServingDescription: '1 cup', defaultServingGrams: 150, aliases: ['angoor'] },
  { name: 'Watermelon', category: 'FRUIT', caloriesPer100g: 30, proteinPer100g: 0.6, carbsPer100g: 8, fatPer100g: 0.2, defaultServingDescription: '1 cup cubed', defaultServingGrams: 150, aliases: ['tarbooz'] },
  { name: 'Pomegranate', category: 'FRUIT', caloriesPer100g: 83, proteinPer100g: 1.7, carbsPer100g: 19, fatPer100g: 1.2, defaultServingDescription: '1 cup arils', defaultServingGrams: 150, aliases: ['anar'] },
  { name: 'Guava', category: 'FRUIT', caloriesPer100g: 68, proteinPer100g: 2.6, carbsPer100g: 14, fatPer100g: 1, defaultServingDescription: '1 medium guava', defaultServingGrams: 150, aliases: ['amrood'] },
  { name: 'Dates', category: 'FRUIT', caloriesPer100g: 282, proteinPer100g: 2.5, carbsPer100g: 75, fatPer100g: 0.4, defaultServingDescription: '3 dates', defaultServingGrams: 30, aliases: ['khajoor'] },
  { name: 'Almonds', category: 'SNACK', caloriesPer100g: 579, proteinPer100g: 21, carbsPer100g: 22, fatPer100g: 50, defaultServingDescription: '10 almonds', defaultServingGrams: 12, aliases: ['badam'] },
  { name: 'Walnuts', category: 'SNACK', caloriesPer100g: 654, proteinPer100g: 15, carbsPer100g: 14, fatPer100g: 65, defaultServingDescription: '5 halves', defaultServingGrams: 15, aliases: ['akhrot'] },
  { name: 'Peanuts (roasted)', category: 'SNACK', caloriesPer100g: 567, proteinPer100g: 26, carbsPer100g: 16, fatPer100g: 49, defaultServingDescription: '1 small handful', defaultServingGrams: 30, aliases: ['moongphali'] },
  { name: 'Chickpeas (boiled)', category: 'VEGETABLE', caloriesPer100g: 164, proteinPer100g: 9, carbsPer100g: 27, fatPer100g: 2.6, defaultServingDescription: '1 cup', defaultServingGrams: 165, aliases: ['boiled chana'] },
  { name: 'Kidney Beans (boiled)', category: 'VEGETABLE', caloriesPer100g: 127, proteinPer100g: 9, carbsPer100g: 23, fatPer100g: 0.5, defaultServingDescription: '1 cup', defaultServingGrams: 175, aliases: ['boiled rajma'] },
  { name: 'Potato Chips', category: 'SNACK', caloriesPer100g: 536, proteinPer100g: 7, carbsPer100g: 53, fatPer100g: 35, defaultServingDescription: '1 small bag', defaultServingGrams: 30, aliases: ['chips packet'] },
  { name: 'Biscuits (plain)', category: 'SNACK', caloriesPer100g: 460, proteinPer100g: 7, carbsPer100g: 68, fatPer100g: 18, defaultServingDescription: '2 biscuits', defaultServingGrams: 20, aliases: ['cookies'] },
  { name: 'Chocolate (milk)', category: 'SNACK', caloriesPer100g: 535, proteinPer100g: 7.7, carbsPer100g: 59, fatPer100g: 30, defaultServingDescription: '1 small bar', defaultServingGrams: 40, aliases: [] },
  { name: 'Honey', category: 'OTHER', caloriesPer100g: 304, proteinPer100g: 0.3, carbsPer100g: 82, fatPer100g: 0, defaultServingDescription: '1 tbsp', defaultServingGrams: 21, aliases: ['shehad'] },
  { name: 'Sugar (white)', category: 'OTHER', caloriesPer100g: 387, proteinPer100g: 0, carbsPer100g: 100, fatPer100g: 0, defaultServingDescription: '1 tsp', defaultServingGrams: 4, aliases: ['cheeni'] },
];
